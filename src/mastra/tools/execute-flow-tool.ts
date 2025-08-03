import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Tool to execute existing Kestra flows
 * Executes flows that have already been created in Kestra, returning execution status and errors
 */
export const executeFlowTool = createTool({
  id: "execute-flow-tool",
  description: `Executes an existing Kestra flow. This tool triggers execution of a flow that has already been created in Kestra and returns execution status, errors, and execution ID. Use this tool only after a flow has been created with create-flow-tool.`,
  inputSchema: z.object({
    namespace: z.string().describe("Kestra namespace for the flow"),
    flowId: z.string().describe("The flow ID to execute"),
    inputs: z
      .record(z.any())
      .optional()
      .describe("Input values for the flow execution"),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Whether the flow was successfully executed"),
    executionId: z
      .string()
      .optional()
      .describe("Kestra execution ID if successful"),
    flowId: z.string().describe("The flow ID that was executed"),
    namespace: z.string().describe("The namespace used"),
    status: z
      .string()
      .describe(
        "Current execution status (CREATED, RUNNING, SUCCESS, FAILED, etc.)"
      ),
    errors: z
      .array(z.string())
      .describe("Any errors encountered during execution"),
    executionUrl: z
      .string()
      .optional()
      .describe("URL to view the execution in Kestra UI"),
  }),
  execute: async ({ context: { namespace, flowId, inputs } }) => {
    const errors: string[] = [];

    try {
      // Step 1: Check if workflow exists
      try {
        const existsResponse = await axios.get(
          `${KESTRA_BASE_URL}/api/v1/flows/${namespace}/${flowId}`
        );

        if (existsResponse.status !== 200) {
          errors.push(
            `Workflow ${namespace}/${flowId} does not exist. Create it first using create-workflow-tool.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "WORKFLOW_NOT_FOUND",
            errors,
          };
        }
      } catch (checkError: any) {
        if (checkError.response?.status === 404) {
          errors.push(
            `Workflow ${namespace}/${flowId} does not exist. Create it first using create-workflow-tool.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "WORKFLOW_NOT_FOUND",
            errors,
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
          };
        }
      }

      // Step 2: Execute the workflow
      try {
        const executeUrl = `${KESTRA_BASE_URL}/api/v1/executions/${namespace}/${flowId}`;
        const executeResponse = await axios.post(executeUrl, inputs || {}, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        const execution = executeResponse.data;
        const executionId = execution.id;
        const executionUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}`;

        // Wait a moment for execution to start
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get updated execution status
        const statusResponse = await axios.get(
          `${KESTRA_BASE_URL}/api/v1/executions/${executionId}`
        );
        const currentStatus = statusResponse.data.state.current;

        return {
          success: true,
          executionId,
          flowId,
          namespace,
          status: currentStatus,
          errors,
          executionUrl,
        };
      } catch (executeError: any) {
        const errorMessage =
          executeError.response?.data?.message || executeError.message;
        errors.push(`Failed to execute workflow: ${errorMessage}`);

        return {
          success: false,
          flowId,
          namespace,
          status: "EXECUTION_FAILED",
          errors,
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
      };
    }
  },
});
