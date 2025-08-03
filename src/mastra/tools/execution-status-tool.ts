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
    const errors: string[] = [];
    
    try {
      const statusResponse = await axios.get(`${KESTRA_BASE_URL}/api/v1/executions/${executionId}`);
      const execution = statusResponse.data;
      
      const status = execution.state?.current || "UNKNOWN";
      const startDate = execution.state?.startDate;
      const endDate = execution.state?.endDate;
      
      // Calculate duration if both start and end dates are available
      let duration: string | undefined;
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const durationMs = end.getTime() - start.getTime();
        duration = `${Math.round(durationMs / 1000)}s`;
      }
      
      // Extract namespace and workflow ID for URL construction
      const namespace = execution.namespace;
      const workflowId = execution.flowId;
      const executionUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${workflowId}/${executionId}`;
      
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
      const errorMessage = error.response?.data?.message || error.message || "Unknown error";
      errors.push(`Failed to get execution status: ${errorMessage}`);
      
      return {
        success: false,
        executionId,
        status: "ERROR",
        errors,
      };
    }
  },
});
