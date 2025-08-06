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
    console.log(`[EDIT-FLOW-TOOL] Starting execution with params:`);
    console.log(`[EDIT-FLOW-TOOL] - namespace: ${namespace}`);
    console.log(`[EDIT-FLOW-TOOL] - flowId: ${flowId}`);
    console.log(`[EDIT-FLOW-TOOL] - description: ${description || "<not provided>"}`);
    console.log(`[EDIT-FLOW-TOOL] - flowYaml length: ${flowYaml.length} characters`);
    
    const errors: string[] = [];
    const validationErrors: string[] = [];

    try {
      // Step 1: Validate YAML syntax
      console.log(`[EDIT-FLOW-TOOL] Starting YAML validation`);
      let parsedYaml: any;
      try {
        parsedYaml = yaml.parse(flowYaml);
        console.log(`[EDIT-FLOW-TOOL] YAML parsed successfully`);
      } catch (yamlError: any) {
        console.log(`[EDIT-FLOW-TOOL] YAML parsing failed: ${yamlError.message}`);
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

      // Step 2: Validate Kestra flow structure
      console.log(`[EDIT-FLOW-TOOL] Validating Kestra flow structure`);
      
      if (!parsedYaml.id) {
        console.log(`[EDIT-FLOW-TOOL] Validation error: Missing 'id' field`);
        validationErrors.push("Flow must have an 'id' field");
      } else {
        console.log(`[EDIT-FLOW-TOOL] Flow ID from YAML: ${parsedYaml.id}`);
      }

      if (!parsedYaml.namespace) {
        console.log(`[EDIT-FLOW-TOOL] Validation error: Missing 'namespace' field`);
        validationErrors.push("Flow must have a 'namespace' field");
      } else {
        console.log(`[EDIT-FLOW-TOOL] Namespace from YAML: ${parsedYaml.namespace}`);
      }

      if (
        !parsedYaml.tasks ||
        !Array.isArray(parsedYaml.tasks) ||
        parsedYaml.tasks.length === 0
      ) {
        console.log(`[EDIT-FLOW-TOOL] Validation error: Missing or empty 'tasks' array`);
        validationErrors.push(
          "Flow must have at least one task in the 'tasks' array"
        );
      } else {
        console.log(`[EDIT-FLOW-TOOL] Tasks found in YAML: ${parsedYaml.tasks.length} tasks`);
      }

      // Ensure the flow ID matches
      if (parsedYaml.id !== flowId) {
        console.log(`[EDIT-FLOW-TOOL] ID mismatch - YAML: ${parsedYaml.id}, Provided: ${flowId}`);
        validationErrors.push(
          `Flow ID in YAML (${parsedYaml.id}) must match the provided flow ID (${flowId})`
        );
      } else {
        console.log(`[EDIT-FLOW-TOOL] Flow ID matches: ${flowId}`);
      }

      // Ensure the namespace matches
      if (parsedYaml.namespace !== namespace) {
        console.log(`[EDIT-FLOW-TOOL] Namespace mismatch - YAML: ${parsedYaml.namespace}, Provided: ${namespace}`);
        validationErrors.push(
          `Namespace in YAML (${parsedYaml.namespace}) must match the provided namespace (${namespace})`
        );
      } else {
        console.log(`[EDIT-FLOW-TOOL] Namespace matches: ${namespace}`);
      }

      if (validationErrors.length > 0) {
        console.log(`[EDIT-FLOW-TOOL] Validation failed with ${validationErrors.length} errors`);
        return {
          success: false,
          flowId,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }
      
      console.log(`[EDIT-FLOW-TOOL] Flow structure validation successful`);

      // Step 3: Check if flow exists first
      console.log(`[EDIT-FLOW-TOOL] Checking if flow exists: ${namespace}/${flowId}`);
      try {
        const existsResponse = await axios.get(
          `${KESTRA_BASE_URL}/api/v1/main/flows/${namespace}/${flowId}`
        );
        console.log(`[EDIT-FLOW-TOOL] Flow exists check successful: ${existsResponse.status}`);

        if (existsResponse.status !== 200) {
          console.log(`[EDIT-FLOW-TOOL] Flow not found with status ${existsResponse.status}`);
          errors.push(
            `Flow ${namespace}/${flowId} does not exist. Use create-flow-tool to create it first.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "FLOW_NOT_FOUND",
            errors,
            validationErrors: [],
          };
        }
      } catch (checkError: any) {
        if (checkError.response?.status === 404) {
          console.log(`[EDIT-FLOW-TOOL] Flow not found (404)`);
          errors.push(
            `Flow ${namespace}/${flowId} does not exist. Use create-flow-tool to create it first.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "FLOW_NOT_FOUND",
            errors,
            validationErrors: [],
          };
        } else {
          console.log(`[EDIT-FLOW-TOOL] API error checking flow: ${checkError.message}`);
          errors.push(
            `Error checking flow existence: ${checkError.message}`
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

      // Step 4: Update flow in Kestra
      console.log(`[EDIT-FLOW-TOOL] Updating flow in Kestra: ${namespace}/${flowId}`);
      try {
        console.log(`[EDIT-FLOW-TOOL] Making PUT request to ${KESTRA_BASE_URL}/api/v1/main/flows/${namespace}/${flowId}`);
        const updateResponse = await axios.put(
          `${KESTRA_BASE_URL}/api/v1/main/flows/${namespace}/${flowId}`,
          flowYaml,
          {
            headers: {
              "Content-Type": "application/x-yaml",
            },
          }
        );

        if (updateResponse.status === 200) {
          console.log(`[EDIT-FLOW-TOOL] Flow successfully updated with status ${updateResponse.status}`);
          const flowUrl = `${KESTRA_BASE_URL}/ui/main/flows/edit/${namespace}/${flowId}/topology`;
          console.log(`[EDIT-FLOW-TOOL] Generated flow URL: ${flowUrl}`);
          return {
            success: true,
            flowId,
            namespace,
            status: "UPDATED",
            errors: [],
            validationErrors: [],
            flowUrl,
            changes: description || "Flow updated successfully",
          };
        } else {
          console.log(`[EDIT-FLOW-TOOL] Flow update failed with status ${updateResponse.status}`);
          errors.push(
            `Failed to update flow: HTTP ${updateResponse.status}`
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
          "Unknown error during flow update";
        console.log(`[EDIT-FLOW-TOOL] API error during flow update: ${errorMessage}`);
        errors.push(`Flow update failed: ${errorMessage}`);

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
      console.log(`[EDIT-FLOW-TOOL] Unexpected error: ${error.message}`);
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
