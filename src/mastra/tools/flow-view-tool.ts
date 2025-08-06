import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Tool to generate Kestra UI URLs for flow visualization
 * Provides direct links to various Kestra UI views for better user experience
 */
export const flowViewTool = createTool({
  id: "flow-view-tool",
  description: `Generates URLs for viewing flows and executions in the Kestra UI. Use this to provide users with direct links to see their flows, execution topology, logs, and other visual information in Kestra.`,
  inputSchema: z.object({
    viewType: z
      .enum(["execution", "topology", "logs", "flow", "namespace", "gantt"])
      .describe("Type of view to generate URL for"),
    namespace: z.string().describe("Kestra namespace"),
    flowId: z
      .string()
      .optional()
      .describe("Flow ID (required for flow and execution views)"),
    executionId: z
      .string()
      .optional()
      .describe("Execution ID (required for execution-specific views)"),
  }),
  outputSchema: z.object({
    url: z.string().describe("Direct URL to the requested Kestra UI view"),
    viewType: z.string().describe("Type of view the URL points to"),
    description: z
      .string()
      .describe("Human-readable description of what the URL shows"),
    instructions: z
      .string()
      .describe("Instructions for the user on what they'll see"),
  }),
  execute: async ({
    context: { viewType, namespace, flowId, executionId },
  }) => {
    console.log(`[FLOW-VIEW-TOOL] Starting execution with params:`);
    console.log(`[FLOW-VIEW-TOOL] - viewType: ${viewType}`);
    console.log(`[FLOW-VIEW-TOOL] - namespace: ${namespace}`);
    console.log(`[FLOW-VIEW-TOOL] - flowId: ${flowId || '<not provided>'}`);
    console.log(`[FLOW-VIEW-TOOL] - executionId: ${executionId || '<not provided>'}`);
    
    let url: string;
    let description: string;
    let instructions: string;

    console.log(`[FLOW-VIEW-TOOL] Generating URL for view type: ${viewType}`);
    switch (viewType) {
      case "execution":
        console.log(`[FLOW-VIEW-TOOL] Generating execution view URL`);
        if (!flowId || !executionId) {
          console.log(`[FLOW-VIEW-TOOL] Error: Missing required parameters for execution view`);
          throw new Error(
            "Both flowId and executionId are required for execution view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}`;
        console.log(`[FLOW-VIEW-TOOL] Generated URL: ${url}`);
        description = `Execution details for flow '${flowId}' (execution: ${executionId})`;
        instructions =
          "This page shows the complete execution details including task status, timing, inputs, outputs, and any errors. You can see the execution timeline and drill down into individual task results.";
        break;

      case "topology":
        console.log(`[FLOW-VIEW-TOOL] Generating topology view URL`);
        if (!flowId || !executionId) {
          console.log(`[FLOW-VIEW-TOOL] Error: Missing required parameters for topology view`);
          throw new Error(
            "Both flowId and executionId are required for topology view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}/topology`;
        console.log(`[FLOW-VIEW-TOOL] Generated URL: ${url}`);
        description = `Topology view for flow '${flowId}' execution`;
        instructions =
          "This page shows a visual graph of your flow with task dependencies, execution status, and flow direction. Green tasks completed successfully, red tasks failed, and yellow tasks are running or pending.";
        break;

      case "logs":
        console.log(`[FLOW-VIEW-TOOL] Generating logs view URL`);
        if (!flowId || !executionId) {
          console.log(`[FLOW-VIEW-TOOL] Error: Missing required parameters for logs view`);
          throw new Error(
            "Both flowId and executionId are required for logs view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}/logs`;
        console.log(`[FLOW-VIEW-TOOL] Generated URL: ${url}`);
        description = `Execution logs for flow '${flowId}'`;
        instructions =
          "This page shows all log output from your flow execution. You can filter by task, log level, and search through the logs to debug issues or verify expected behavior.";
        break;

      case "flow":
        console.log(`[FLOW-VIEW-TOOL] Generating flow definition view URL`);
        if (!flowId) {
          console.log(`[FLOW-VIEW-TOOL] Error: Missing flowId for flow view`);
          throw new Error("flowId is required for flow view");
        }
        url = `${KESTRA_BASE_URL}/ui/flows/${namespace}/${flowId}`;
        console.log(`[FLOW-VIEW-TOOL] Generated URL: ${url}`);
        description = `Flow definition for '${flowId}'`;
        instructions = "This page shows your flow definition, allows you to edit the YAML, view the flow graph, and see execution history. You can also manually trigger new executions from here.";
        break;

      case "namespace":
        console.log(`[FLOW-VIEW-TOOL] Generating namespace view URL`);
        url = `${KESTRA_BASE_URL}/ui/flows?namespace=${namespace}`;
        console.log(`[FLOW-VIEW-TOOL] Generated URL: ${url}`);
        description = `All flows in namespace '${namespace}'`;
        instructions = "This page lists all flows in your namespace. You can see flow status, recent executions, and create new flows. Use this to get an overview of all your automation.";
        break;

      case "gantt":
        console.log(`[FLOW-VIEW-TOOL] Generating gantt chart view URL`);
        if (!flowId || !executionId) {
          console.log(`[FLOW-VIEW-TOOL] Error: Missing required parameters for gantt view`);
          throw new Error(
            "Both flowId and executionId are required for gantt view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}/gantt`;
        console.log(`[FLOW-VIEW-TOOL] Generated URL: ${url}`);
        description = `Gantt chart for flow '${flowId}' execution`;
        instructions = "This page shows a timeline view of your flow execution with task durations, dependencies, and parallel execution. Great for understanding performance and identifying bottlenecks.";
        break;

      default:
        console.log(`[FLOW-VIEW-TOOL] Error: Unknown view type: ${viewType}`);
        throw new Error(`Unknown view type: ${viewType}`);
    }

    console.log(`[FLOW-VIEW-TOOL] Successfully generated URL and returning results`);
    console.log(`[FLOW-VIEW-TOOL] - URL: ${url}`);
    console.log(`[FLOW-VIEW-TOOL] - View type: ${viewType}`);
    console.log(`[FLOW-VIEW-TOOL] - Description: ${description}`);
    
    return {
      url,
      viewType,
      description,
      instructions,
    };
  },
});

/**
 * Tool to generate multiple useful Kestra UI links at once
 */
export const generateFlowLinksTool = createTool({
  id: "generate-flow-links-tool",
  description: `Generates a comprehensive set of Kestra UI links for a flow execution. Use this to provide users with all the important links they might need to explore their flow.`,
  inputSchema: z.object({
    namespace: z.string().describe("Kestra namespace"),
    flowId: z.string().describe("Flow ID"),
    executionId: z.string().optional().describe("Execution ID (if available)"),
  }),
  outputSchema: z.object({
    flowUrl: z.string().describe("URL to view the flow definition"),
    executionUrl: z
      .string()
      .optional()
      .describe("URL to view the specific execution"),
    topologyUrl: z
      .string()
      .optional()
      .describe("URL to view the execution topology/graph"),
    logsUrl: z.string().optional().describe("URL to view execution logs"),
    ganttUrl: z.string().optional().describe("URL to view execution timeline"),
    namespaceUrl: z
      .string()
      .describe("URL to view all flows in the namespace"),
    summary: z
      .string()
      .describe("Summary of available links and their purposes"),
  }),
  execute: async ({ context: { namespace, flowId, executionId } }) => {
    console.log(`[GENERATE-FLOW-LINKS] Starting execution with params:`);
    console.log(`[GENERATE-FLOW-LINKS] - namespace: ${namespace}`);
    console.log(`[GENERATE-FLOW-LINKS] - flowId: ${flowId}`);
    console.log(`[GENERATE-FLOW-LINKS] - executionId: ${executionId || '<not provided>'}`);
    
    const flowUrl = `${KESTRA_BASE_URL}/ui/flows/${namespace}/${flowId}`;
    console.log(`[GENERATE-FLOW-LINKS] Generated flow URL: ${flowUrl}`);
    
    const namespaceUrl = `${KESTRA_BASE_URL}/ui/flows?namespace=${namespace}`;
    console.log(`[GENERATE-FLOW-LINKS] Generated namespace URL: ${namespaceUrl}`);

    let executionUrl: string | undefined;
    let topologyUrl: string | undefined;
    let logsUrl: string | undefined;
    let ganttUrl: string | undefined;

    if (executionId) {
      console.log(`[GENERATE-FLOW-LINKS] Generating execution-related URLs`);
      executionUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}`;
      console.log(`[GENERATE-FLOW-LINKS] Generated execution URL: ${executionUrl}`);
      
      topologyUrl = `${executionUrl}/topology`;
      console.log(`[GENERATE-FLOW-LINKS] Generated topology URL: ${topologyUrl}`);
      
      logsUrl = `${executionUrl}/logs`;
      console.log(`[GENERATE-FLOW-LINKS] Generated logs URL: ${logsUrl}`);
      
      ganttUrl = `${executionUrl}/gantt`;
      console.log(`[GENERATE-FLOW-LINKS] Generated gantt URL: ${ganttUrl}`);
    } else {
      console.log(`[GENERATE-FLOW-LINKS] No executionId provided, skipping execution-related URLs`);
    }

    const summary = `
## Kestra UI Links for ${namespace}/${flowId}

- **Flow Definition**: View and edit your flow definition
- **Namespace**: See all flows in the ${namespace} namespace
${executionId ? `- **Execution**: View details for execution ${executionId}
- **Topology**: See a visual graph of the execution
- **Logs**: View detailed execution logs
- **Gantt**: See a timeline of task execution` : `
💡 **Tip**: Once you execute the flow, you'll get additional links for execution details, topology view, and logs.`}

Click on any link to open the corresponding view in the Kestra UI.
`;

    console.log(`[GENERATE-FLOW-LINKS] Returning all generated URLs`);
    return {
      flowUrl,
      executionUrl,
      topologyUrl,
      logsUrl,
      ganttUrl,
      namespaceUrl,
      summary,
    };
  },
});
