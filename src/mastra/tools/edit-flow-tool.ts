import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as yaml from "yaml";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Tool to edit/update an existing Kestra flow
 * This tool should be used to make changes to flows that have already been created
 */
export const editFlowTool = createTool({
  id: "edit-flow-tool",
  description: `Updates an existing Kestra flow with new YAML definition. This tool validates the YAML syntax and updates the flow in Kestra. Use this tool to make changes to flows that have already been created with create-flow-tool.`,
  inputSchema: z.object({
    flowYaml: z.string().describe("The updated complete YAML flow definition"),
    namespace: z.string().describe("Kestra namespace for the flow"),
    flowId: z.string().describe("The flow ID to update"),
    description: z
      .string()
      .optional()
      .describe("Description of what changes are being made"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the flow was successfully updated"),
    flowId: z.string().describe("The flow ID that was updated"),
    namespace: z.string().describe("The namespace used"),
    status: z
      .string()
      .describe("Update status (UPDATED, VALIDATION_FAILED, etc.)"),
    errors: z
      .array(z.string())
      .describe("Any errors encountered during update"),
    validationErrors: z.array(z.string()).describe("YAML validation errors"),
    flowUrl: z
      .string()
      .optional()
      .describe("URL to view the updated flow in Kestra UI"),
    changes: z.string().optional().describe("Summary of changes made"),
  }),
  execute: async ({
    context: { flowYaml, namespace, flowId, description },
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
          flowId,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      // Step 2: Validate Kestra workflow structure
      if (!parsedYaml.id) {
        validationErrors.push("Workflow must have an 'id' field");
      }

      if (!parsedYaml.namespace) {
        validationErrors.push("Workflow must have a 'namespace' field");
      }

      if (
        !parsedYaml.tasks ||
        !Array.isArray(parsedYaml.tasks) ||
        parsedYaml.tasks.length === 0
      ) {
        validationErrors.push(
          "Workflow must have at least one task in the 'tasks' array"
        );
      }

      // Ensure the workflow ID matches
      if (parsedYaml.id !== flowId) {
        validationErrors.push(
          `Workflow ID in YAML (${parsedYaml.id}) must match the provided workflow ID (${flowId})`
        );
      }

      // Ensure the namespace matches
      if (parsedYaml.namespace !== namespace) {
        validationErrors.push(
          `Namespace in YAML (${parsedYaml.namespace}) must match the provided namespace (${namespace})`
        );
      }

      if (validationErrors.length > 0) {
        return {
          success: false,
          flowId,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      // Step 3: Check if workflow exists first
      try {
        const existsResponse = await axios.get(
          `${KESTRA_BASE_URL}/api/v1/flows/${namespace}/${flowId}`
        );

        if (existsResponse.status !== 200) {
          errors.push(
            `Workflow ${namespace}/${flowId} does not exist. Use create-workflow-tool to create it first.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "WORKFLOW_NOT_FOUND",
            errors,
            validationErrors: [],
          };
        }
      } catch (checkError: any) {
        if (checkError.response?.status === 404) {
          errors.push(
            `Workflow ${namespace}/${flowId} does not exist. Use create-workflow-tool to create it first.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "WORKFLOW_NOT_FOUND",
            errors,
            validationErrors: [],
          };
        } else {
          errors.push(
            `Error checking workflow existence: ${checkError.message}`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "ERROR",
            errors,
            validationErrors: [],
          };
        }
      }

      // Step 4: Update workflow in Kestra
      try {
        const updateResponse = await axios.put(
          `${KESTRA_BASE_URL}/api/v1/flows/${namespace}/${flowId}`,
          flowYaml,
          {
            headers: {
              "Content-Type": "application/x-yaml",
            },
          }
        );

        if (updateResponse.status === 200) {
          return {
            success: true,
            flowId,
            namespace,
            status: "UPDATED",
            errors: [],
            validationErrors: [],
            flowUrl: `${KESTRA_BASE_URL}/ui/flows/${namespace}/${flowId}`,
            changes: description || "Workflow updated successfully",
          };
        } else {
          errors.push(
            `Failed to update workflow: HTTP ${updateResponse.status}`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "UPDATE_FAILED",
            errors,
            validationErrors: [],
          };
        }
      } catch (updateError: any) {
        const errorMessage =
          updateError.response?.data?.message ||
          updateError.message ||
          "Unknown error during workflow update";
        errors.push(`Workflow update failed: ${errorMessage}`);

        return {
          success: false,
          flowId,
          namespace,
          status: "UPDATE_FAILED",
          errors,
          validationErrors: [],
        };
      }
    } catch (error: any) {
      errors.push(`Unexpected error: ${error.message}`);
      return {
        success: false,
        flowId,
        namespace,
        status: "ERROR",
        errors,
        validationErrors: [],
      };
    }
  },
});
