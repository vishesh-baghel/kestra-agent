import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as yaml from "yaml";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Generate a random flow ID with timestamp and random suffix
 */
function generateRandomFlowId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `flow-${timestamp}-${randomSuffix}`;
}

/**
 * Tool to create a new Kestra flow from YAML definition
 * This tool should be used only once at the start of a conversation to create a new flow
 */
export const createFlowTool = createTool({
  id: "create-flow-tool",
  description: `Creates a new Kestra flow from YAML definition. This tool validates the YAML syntax and creates the flow in Kestra. Use this tool only once at the start of a conversation to create a new flow. For modifications, use the edit-flow-tool instead.`,
  inputSchema: z.object({
    flowYaml: z
      .string()
      .describe("The complete YAML flow definition to create"),
    namespace: z
      .string()
      .default("company.team")
      .describe("Kestra namespace for the flow"),
    flowId: z
      .string()
      .optional()
      .describe(
        "Specific flow ID (will be extracted from YAML if not provided)"
      ),
    userProvidedName: z
      .string()
      .optional()
      .describe(
        "User-provided name for the flow (will be converted to kebab-case for flowId)"
      ),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the flow was successfully created"),
    flowId: z.string().optional().describe("The flow ID that was created"),
    namespace: z.string().describe("The namespace used"),
    status: z
      .string()
      .describe("Creation status (CREATED, VALIDATION_FAILED, etc.)"),
    errors: z
      .array(z.string())
      .describe("Any errors encountered during creation"),
    validationErrors: z.array(z.string()).describe("YAML validation errors"),
    flowUrl: z
      .string()
      .optional()
      .describe("URL to view the flow in Kestra UI"),
  }),
  execute: async ({
    context: { flowYaml, namespace, flowId, userProvidedName },
  }) => {
    const errors: string[] = [];
    const validationErrors: string[] = [];

    try {
      // Step 1: Validate YAML syntax
      let parsedYaml: any;
      try {
        parsedYaml = yaml.parse(flowYaml);
      } catch (yamlError: any) {
        validationErrors.push(`YAML syntax error: ${yamlError.message}`);
        return {
          success: false,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      // Step 2: Validate Kestra flow structure
      if (!parsedYaml.id) {
        validationErrors.push("Flow must have an 'id' field");
      }

      if (!parsedYaml.namespace) {
        validationErrors.push("Flow must have a 'namespace' field");
      }

      if (
        !parsedYaml.tasks ||
        !Array.isArray(parsedYaml.tasks) ||
        parsedYaml.tasks.length === 0
      ) {
        validationErrors.push(
          "Flow must have at least one task in the 'tasks' array"
        );
      }

      if (validationErrors.length > 0) {
        return {
          success: false,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      // Determine the flow ID to use
      let finalFlowId = flowId || parsedYaml.id;

      // If user provided a name, convert it to kebab-case and use as flowId
      if (userProvidedName && !flowId) {
        finalFlowId = userProvidedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }

      // If no flowId determined yet, generate a random one
      if (!finalFlowId) {
        finalFlowId = generateRandomFlowId();
      }

      const finalNamespace = parsedYaml.namespace || namespace;

      // Update the YAML with the final flowId
      const updatedYaml = flowYaml.replace(/^id:\s*.*$/m, `id: ${finalFlowId}`);

      // Step 3: Create flow in Kestra with retry logic for ID conflicts
      const attemptCreateFlow = async (
        yamlContent: string,
        attemptFlowId: string
      ): Promise<any> => {
        try {
          const createResponse = await axios.post(
            `${KESTRA_BASE_URL}/api/v1/flows`,
            yamlContent,
            {
              headers: {
                "Content-Type": "application/x-yaml",
              },
            }
          );
          return {
            success: true,
            response: createResponse,
            flowId: attemptFlowId,
          };
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.message || error.message || "";

          // Check if error is due to flow ID already existing
          if (
            errorMessage.includes("already exists") ||
            errorMessage.includes("flowId already exists") ||
            error.response?.status === 409
          ) {
            return { success: false, isConflict: true, error: errorMessage };
          }

          return { success: false, isConflict: false, error: errorMessage };
        }
      };

      // First attempt with the determined flow ID
      let result = await attemptCreateFlow(updatedYaml, finalFlowId);

      // If there's a conflict, try with a random flow ID
      if (!result.success && result.isConflict) {
        const randomFlowId = generateRandomFlowId();
        const randomYaml = updatedYaml.replace(
          /^id:\s*.*$/m,
          `id: ${randomFlowId}`
        );
        result = await attemptCreateFlow(randomYaml, randomFlowId);

        if (result.success) {
          // Add a note about the fallback
          errors.push(
            `Original flow ID '${finalFlowId}' already exists, used random ID '${randomFlowId}' instead`
          );
          finalFlowId = randomFlowId;
        }
      }

      if (result.success) {
        const createResponse = result.response;

        if (createResponse.status === 200 || createResponse.status === 201) {
          return {
            success: true,
            flowId: finalFlowId,
            namespace: finalNamespace,
            status: "CREATED",
            errors,
            validationErrors: [],
            flowUrl: `${KESTRA_BASE_URL}/ui/main/flows/edit/${finalNamespace}/${finalFlowId}/topology`,
          };
        } else {
          errors.push(`Failed to create flow: HTTP ${createResponse.status}`);
          return {
            success: false,
            namespace: finalNamespace,
            status: "CREATION_FAILED",
            errors,
            validationErrors: [],
          };
        }
      } else {
        // Handle the case where both attempts failed
        const errorMessage =
          result.error || "Unknown error during flow creation";
        errors.push(`Flow creation failed: ${errorMessage}`);

        return {
          success: false,
          namespace: finalNamespace,
          status: "CREATION_FAILED",
          errors,
          validationErrors: [],
        };
      }
    } catch (error: any) {
      errors.push(`Unexpected error: ${error.message}`);
      return {
        success: false,
        namespace,
        status: "ERROR",
        errors,
        validationErrors: [],
      };
    }
  },
});
