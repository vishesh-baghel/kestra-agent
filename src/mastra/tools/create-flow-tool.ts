import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as yaml from "yaml";
import { getStoredYaml } from "../utils/yaml-interceptor";
import { FLOW_CONTEXT_KEYS } from "../context/flow-constants";
import { RuntimeContext } from "@mastra/core/runtime-context";

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
 * Now automatically generates unique flow IDs without requiring user input
 */
export const createFlowTool = createTool({
  id: "create-flow-tool",
  description: `Creates a new Kestra flow from YAML definition with an automatically generated unique ID. This tool validates the YAML syntax and creates the flow in Kestra. Use this tool only once at the start of a conversation to create a new flow. For modifications, use the edit-flow-tool instead.`,
  inputSchema: z.object({
    flowYaml: z
      .string()
      .describe("The complete YAML flow definition to create")
      .optional(),
    namespace: z
      .string()
      .default("company.team")
      .describe("Kestra namespace for the flow"),
    flowId: z
      .string()
      .optional()
      .describe("Optional specific flow ID (auto-generated if not provided)"),
    flowPurpose: z
      .string()
      .optional()
      .describe(
        "Brief description of flow purpose to use in the auto-generated ID"
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
  execute: async (params: any, ctx?: any) => {
    console.log("[CREATE-FLOW-TOOL] Starting execution with params:", params);

    // Extract parameters, handling both direct and nested context structure
    const contextParams = params.context || params;
    const inputFlowYaml = contextParams.flowYaml;
    const namespace = contextParams.namespace;
    const flowId = contextParams.flowId;
    const flowPurpose = contextParams.flowPurpose;
    const runtimeContext: RuntimeContext | undefined = ctx?.runtimeContext;
    // Check if a flowYaml was provided or try to get it from runtime context
    let yamlContent = inputFlowYaml;

    if (!yamlContent && runtimeContext) {
      try {
        yamlContent = getStoredYaml(runtimeContext);
        if (yamlContent) {
          console.log("📄 Using YAML flow definition from runtime context");
        }
      } catch (error) {
        console.error("❌ Error retrieving YAML from runtime context:", error);
      }
    }

    // Store the flowId and namespace in runtime context if available
    if (runtimeContext) {
      try {
        runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_ID, flowId);
        runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_NAMESPACE, namespace);
        console.log(`Stored flow ID and namespace in runtime context`);
      } catch (error) {
        // Non-fatal error, just log it
        console.warn(`Could not store flow ID in runtime context:`, error);
      }
    }

    // If we still don't have YAML, return an error
    if (!yamlContent) {
      console.log(
        "No flow YAML provided or found in context. Please provide flow YAML to create a flow."
      );
      return {
        status: "error",
        namespace: namespace || "default",
        success: false,
        message:
          "No flow YAML provided or found in context. Please provide flow YAML to create a flow.",
        errors: ["No flow YAML provided"],
        validationErrors: [],
        flowId: undefined,
        flowUrl: undefined,
      };
    }

    // Use the YAML we've found (either from input or runtime context)
    const flowYaml = yamlContent;

    console.log(`[CREATE-FLOW-TOOL] Starting execution with params:`);
    console.log(`[CREATE-FLOW-TOOL] - namespace: ${namespace}`);
    console.log(
      `[CREATE-FLOW-TOOL] - flowId: ${flowId || "<will be auto-generated>"}`
    );
    console.log(
      `[CREATE-FLOW-TOOL] - flowPurpose: ${flowPurpose || "<not specified>"}`
    );
    console.log(
      `[CREATE-FLOW-TOOL] - flowYaml source: ${runtimeContext ? "runtime context" : "direct input"}`
    );
    console.log(
      `[CREATE-FLOW-TOOL] - flowYaml length: ${flowYaml ? flowYaml.length : 0} characters`
    );

    const errors: string[] = [];
    const validationErrors: string[] = [];

    try {
      // Step 1: Validate YAML syntax
      console.log(`[CREATE-FLOW-TOOL] Starting YAML validation`);
      let parsedYaml: any;
      try {
        parsedYaml = yaml.parse(flowYaml);
        console.log(`[CREATE-FLOW-TOOL] YAML parsed successfully`);
      } catch (yamlError: any) {
        console.log(
          `[CREATE-FLOW-TOOL] YAML parsing failed: ${yamlError.message}`
        );
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
      console.log(`[CREATE-FLOW-TOOL] Validating Kestra flow structure`);

      if (!parsedYaml.id) {
        console.log(`[CREATE-FLOW-TOOL] Validation error: Missing 'id' field`);
        validationErrors.push("Flow must have an 'id' field");
      } else {
        console.log(`[CREATE-FLOW-TOOL] Flow ID from YAML: ${parsedYaml.id}`);
      }

      if (!parsedYaml.namespace) {
        console.log(
          `[CREATE-FLOW-TOOL] Validation error: Missing 'namespace' field`
        );
        validationErrors.push("Flow must have a 'namespace' field");
      } else {
        console.log(
          `[CREATE-FLOW-TOOL] Namespace from YAML: ${parsedYaml.namespace}`
        );
      }

      if (
        !parsedYaml.tasks ||
        !Array.isArray(parsedYaml.tasks) ||
        parsedYaml.tasks.length === 0
      ) {
        console.log(
          `[CREATE-FLOW-TOOL] Validation error: Missing or empty 'tasks' array`
        );
        validationErrors.push(
          "Flow must have at least one task in the 'tasks' array"
        );
      } else {
        console.log(
          `[CREATE-FLOW-TOOL] Tasks found in YAML: ${parsedYaml.tasks.length} tasks`
        );
      }

      if (validationErrors.length > 0) {
        console.log(
          `[CREATE-FLOW-TOOL] Validation failed with ${validationErrors.length} errors`
        );
        return {
          success: false,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      console.log(`[CREATE-FLOW-TOOL] Flow structure validation successful`);

      // Generate a descriptive, unique flow ID
      console.log(`[CREATE-FLOW-TOOL] Generating unique flow ID...`);
      let finalFlowId;

      if (flowId) {
        // Use provided ID if explicitly given
        finalFlowId = flowId;
        console.log(
          `[CREATE-FLOW-TOOL] Using explicitly provided flowId: ${finalFlowId}`
        );
      } else {
        // Generate descriptive ID based on purpose or parsed ID
        const baseId = flowPurpose
          ? flowPurpose
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
          : parsedYaml.id || "flow";

        // Add unique timestamp and random suffix
        const timestamp = Date.now().toString(36);
        const randomSuffix = Math.random().toString(36).substring(2, 5);
        finalFlowId = `${baseId}-${timestamp}-${randomSuffix}`;

        console.log(
          `[CREATE-FLOW-TOOL] Generated unique descriptive flowId: ${finalFlowId}`
        );
      }

      const finalNamespace = parsedYaml.namespace || namespace;
      console.log(`[CREATE-FLOW-TOOL] Using namespace: ${finalNamespace}`);

      // Update the YAML with the final flowId
      const updatedYaml = flowYaml.replace(/^id:\s*.*$/m, `id: ${finalFlowId}`);
      console.log(
        `[CREATE-FLOW-TOOL] Updated YAML with flowId: ${finalFlowId}`
      );

      // Step 3: Create flow in Kestra with retry logic for ID conflicts
      console.log(`[CREATE-FLOW-TOOL] Preparing to create flow in Kestra`);
      const attemptCreateFlow = async (
        yamlContent: string,
        attemptFlowId: string
      ): Promise<any> => {
        console.log(
          `[CREATE-FLOW-TOOL] Attempting to create flow with ID: ${attemptFlowId}`
        );
        try {
          console.log(
            `[CREATE-FLOW-TOOL] Making API request to ${KESTRA_BASE_URL}/api/v1/flows`
          );
          const createResponse = await axios.post(
            `${KESTRA_BASE_URL}/api/v1/flows`,
            yamlContent,
            {
              headers: {
                "Content-Type": "application/x-yaml",
              },
            }
          );
          console.log(
            `[CREATE-FLOW-TOOL] Flow creation successful! Status: ${createResponse.status}`
          );
          return {
            success: true,
            response: createResponse,
          };
        } catch (error: any) {
          if (error.response?.status === 409) {
            // Flow ID conflict
            console.log(
              `[CREATE-FLOW-TOOL] Flow ID conflict: '${attemptFlowId}' already exists`
            );
            return {
              success: false,
              conflict: true,
              error: `Flow ID '${attemptFlowId}' already exists`,
            };
          }
          console.log(`[CREATE-FLOW-TOOL] API error: ${error.message}`);
          return {
            success: false,
            conflict: false,
            error: error.message,
          };
        }
      };

      // First attempt with the determined flow ID
      console.log(`[CREATE-FLOW-TOOL] Sending flow creation request...`);
      let createResult = await attemptCreateFlow(updatedYaml, finalFlowId);

      // If there's a conflict with the ID, try with a random ID instead
      if (!createResult.success && createResult.conflict) {
        const randomId = generateRandomFlowId();
        console.log(
          `[CREATE-FLOW-TOOL] Flow ID conflict detected, retrying with random ID: ${randomId}`
        );
        const retryYaml = updatedYaml.replace(/^id:\s*.*$/m, `id: ${randomId}`);
        errors.push(createResult.error);
        errors.push(`Trying again with a random ID: ${randomId}`);
        console.log(
          `[CREATE-FLOW-TOOL] Sending retry request with random ID...`
        );
        createResult = await attemptCreateFlow(retryYaml, randomId);
      }

      // Handle final result
      if (!createResult.success) {
        console.log(
          `[CREATE-FLOW-TOOL] Flow creation failed: ${createResult.error}`
        );
        errors.push(createResult.error);
        return {
          success: false,
          namespace: finalNamespace,
          status: "API_ERROR",
          errors,
          validationErrors,
        };
      }

      console.log(`[CREATE-FLOW-TOOL] Flow creation successful!`);

      // Generate Kestra UI link
      const kestraUrl = process.env.KESTRA_UI_URL || "http://localhost:8080";
      const flowUrl = `${kestraUrl}/ui/flows/${finalNamespace}/${finalFlowId}`;
      console.log(`[CREATE-FLOW-TOOL] Generated flow URL: ${flowUrl}`);

      console.log(`[CREATE-FLOW-TOOL] Returning successful result`);
      return {
        success: true,
        flowId: finalFlowId,
        namespace: finalNamespace,
        status: "CREATED",
        errors,
        validationErrors,
        flowUrl,
      };
    } catch (error: any) {
      console.log(`[CREATE-FLOW-TOOL] Unexpected error: ${error.message}`);
      errors.push(`Unexpected error: ${error.message}`);
      return {
        success: false,
        namespace,
        status: "ERROR",
        errors,
        validationErrors,
      };
    }
  },
});
