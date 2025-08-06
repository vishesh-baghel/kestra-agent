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
    success: z.boolean().describe("Whether the flow was successfully executed"),
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
    console.log(`[EXECUTE-FLOW-TOOL] Starting execution with params:`);
    console.log(`[EXECUTE-FLOW-TOOL] - namespace: ${namespace}`);
    console.log(`[EXECUTE-FLOW-TOOL] - flowId: ${flowId}`);
    console.log(`[EXECUTE-FLOW-TOOL] - inputs: ${inputs ? JSON.stringify(inputs) : '<not provided>'}`);
    
    const errors: string[] = [];

    try {
      // Step 1: Check if flow exists
      console.log(`[EXECUTE-FLOW-TOOL] Checking if flow exists: ${namespace}/${flowId}`);
      try {
        console.log(`[EXECUTE-FLOW-TOOL] Making API request to ${KESTRA_BASE_URL}/api/v1/flows/${namespace}/${flowId}`);
        const existsResponse = await axios.get(
          `${KESTRA_BASE_URL}/api/v1/flows/${namespace}/${flowId}`
        );

        console.log(`[EXECUTE-FLOW-TOOL] Flow exists check response: ${existsResponse.status}`);
        if (existsResponse.status !== 200) {
          console.log(`[EXECUTE-FLOW-TOOL] Flow not found with status ${existsResponse.status}`);
          errors.push(
            `Flow ${namespace}/${flowId} does not exist. Create it first using create-flow-tool.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "FLOW_NOT_FOUND",
            errors,
          };
        }
        console.log(`[EXECUTE-FLOW-TOOL] Flow exists, proceeding with execution`);
      } catch (checkError: any) {
        if (checkError.response?.status === 404) {
          console.log(`[EXECUTE-FLOW-TOOL] Flow not found (404)`);
          errors.push(
            `Flow ${namespace}/${flowId} does not exist. Create it first using create-flow-tool.`
          );
          return {
            success: false,
            flowId,
            namespace,
            status: "FLOW_NOT_FOUND",
            errors,
          };
        } else {
          console.log(`[EXECUTE-FLOW-TOOL] API error checking flow: ${checkError.message}`);
          errors.push(
            `Error checking flow existence: ${checkError.message}`
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

      // Step 2: Execute the flow
      console.log(`[EXECUTE-FLOW-TOOL] Preparing to execute flow: ${namespace}/${flowId}`);
      try {
        const executeUrl = `${KESTRA_BASE_URL}/api/v1/main/executions/${namespace}/${flowId}`;
        console.log(`[EXECUTE-FLOW-TOOL] Execution URL: ${executeUrl}`);
        
        // Prepare form data for multipart/form-data as required by Kestra API
        const formData = new FormData();
        if (inputs) {
          console.log(`[EXECUTE-FLOW-TOOL] Adding inputs to form data:`, inputs);
          Object.entries(inputs).forEach(([key, value]) => {
            formData.append(key, String(value));
            console.log(`[EXECUTE-FLOW-TOOL] - Added input: ${key}=${String(value)}`);
          });
        } else {
          console.log(`[EXECUTE-FLOW-TOOL] No inputs provided for execution`);
        }
        
        console.log(`[EXECUTE-FLOW-TOOL] Sending execution request to Kestra API`);
        const executeResponse = await axios.post(executeUrl, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        console.log(`[EXECUTE-FLOW-TOOL] Execution request successful with status: ${executeResponse.status}`);

        const execution = executeResponse.data;
        const executionId = execution.id;
        console.log(`[EXECUTE-FLOW-TOOL] Execution created with ID: ${executionId}`);
        const executionUrl = `${KESTRA_BASE_URL}/ui/main/executions/${namespace}/${flowId}/${executionId}`;
        console.log(`[EXECUTE-FLOW-TOOL] Execution URL: ${executionUrl}`);

        // Wait a moment for execution to start
        console.log(`[EXECUTE-FLOW-TOOL] Waiting for execution to initialize...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get updated execution status
        console.log(`[EXECUTE-FLOW-TOOL] Fetching current execution status`);
        const statusResponse = await axios.get(
          `${KESTRA_BASE_URL}/api/v1/main/executions/${executionId}`
        );
        const currentStatus = statusResponse.data.state.current;
        console.log(`[EXECUTE-FLOW-TOOL] Current execution status: ${currentStatus}`);
        console.log(`[EXECUTE-FLOW-TOOL] Full execution state:`, statusResponse.data.state);

        console.log(`[EXECUTE-FLOW-TOOL] Execution successfully initiated, returning results`);
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
        console.log(`[EXECUTE-FLOW-TOOL] Flow execution failed: ${errorMessage}`);
        errors.push(`Failed to execute flow: ${errorMessage}`);

        return {
          success: false,
          flowId,
          namespace,
          status: "EXECUTION_FAILED",
          errors,
        };
      }
    } catch (error: any) {
      console.log(`[EXECUTE-FLOW-TOOL] Unexpected error: ${error.message}`);
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
