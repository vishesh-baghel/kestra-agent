import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Tool to check the status of a running Kestra execution
 */
export const executionStatusTool = createTool({
  id: "execution-status-tool",
  description: `Checks the current status of a Kestra flow execution. Use this tool to monitor the progress of a flow execution and get detailed status information.`,
  inputSchema: z.object({
    executionId: z.string().describe("The execution ID to check status for"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the status check was successful"),
    executionId: z.string().describe("The execution ID that was checked"),
    status: z.string().describe("Current execution status (CREATED, RUNNING, SUCCESS, FAILED, etc.)"),
    startDate: z.string().optional().describe("When the execution started"),
    endDate: z.string().optional().describe("When the execution ended (if completed)"),
    duration: z.string().optional().describe("Execution duration"),
    errors: z.array(z.string()).describe("Any errors encountered"),
    executionUrl: z.string().optional().describe("URL to view the execution in Kestra UI"),
  }),
  execute: async ({ context: { executionId } }) => {
    console.log(`[EXECUTION-STATUS-TOOL] Starting execution status check for executionId: ${executionId}`);
    const errors: string[] = [];
    
    try {
      console.log(`[EXECUTION-STATUS-TOOL] Making API request to Kestra for execution status`);
      console.log(`[EXECUTION-STATUS-TOOL] GET ${KESTRA_BASE_URL}/api/v1/executions/${executionId}`);
      
      const statusResponse = await axios.get(`${KESTRA_BASE_URL}/api/v1/executions/${executionId}`);
      console.log(`[EXECUTION-STATUS-TOOL] Received status response with status code: ${statusResponse.status}`);
      
      const execution = statusResponse.data;
      console.log(`[EXECUTION-STATUS-TOOL] Parsed execution data successfully`);
      
      const status = execution.state?.current || "UNKNOWN";
      console.log(`[EXECUTION-STATUS-TOOL] Execution status: ${status}`);
      
      const startDate = execution.state?.startDate;
      console.log(`[EXECUTION-STATUS-TOOL] Start date: ${startDate || 'not available'}`);
      
      const endDate = execution.state?.endDate;
      console.log(`[EXECUTION-STATUS-TOOL] End date: ${endDate || 'not available'}`);
      
      // Calculate duration if both start and end dates are available
      let duration: string | undefined;
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const durationMs = end.getTime() - start.getTime();
        duration = `${Math.round(durationMs / 1000)}s`;
        console.log(`[EXECUTION-STATUS-TOOL] Calculated duration: ${duration}`);
      } else {
        console.log(`[EXECUTION-STATUS-TOOL] Duration calculation not possible - missing start or end date`);
      }
      
      // Extract namespace and flow ID for URL construction
      const namespace = execution.namespace;
      console.log(`[EXECUTION-STATUS-TOOL] Namespace: ${namespace}`);
      
      const flowId = execution.flowId;
      console.log(`[EXECUTION-STATUS-TOOL] Flow ID: ${flowId}`);
      
      const executionUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}`;
      console.log(`[EXECUTION-STATUS-TOOL] Generated execution URL: ${executionUrl}`);
      
      console.log(`[EXECUTION-STATUS-TOOL] Status check successful, returning results`);
      return {
        success: true,
        executionId,
        status,
        startDate,
        endDate,
        duration,
        errors: [],
        executionUrl,
      };
      
    } catch (error: any) {
      console.log(`[EXECUTION-STATUS-TOOL] Error occurred while checking execution status`);
      
      const errorMessage = error.response?.data?.message || error.message || "Unknown error";
      console.error(`[EXECUTION-STATUS-TOOL] Error details: ${errorMessage}`);
      
      errors.push(`Failed to get execution status: ${errorMessage}`);
      
      console.log(`[EXECUTION-STATUS-TOOL] Returning error response`);
      return {
        success: false,
        executionId,
        status: "ERROR",
        errors,
      };
    }
  },
});
