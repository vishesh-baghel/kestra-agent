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
    let url: string;
    let description: string;
    let instructions: string;

    switch (viewType) {
      case "execution":
        if (!flowId || !executionId) {
          throw new Error(
            "Both flowId and executionId are required for execution view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}`;
        description = `Execution details for flow '${flowId}' (execution: ${executionId})`;
        instructions =
          "This page shows the complete execution details including task status, timing, inputs, outputs, and any errors. You can see the execution timeline and drill down into individual task results.";
        break;

      case "topology":
        if (!flowId || !executionId) {
          throw new Error(
            "Both flowId and executionId are required for topology view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}/topology`;
        description = `Topology view for flow '${flowId}' execution`;
        instructions =
          "This page shows a visual graph of your flow with task dependencies, execution status, and flow direction. Green tasks completed successfully, red tasks failed, and yellow tasks are running or pending.";
        break;

      case "logs":
        if (!flowId || !executionId) {
          throw new Error(
            "Both flowId and executionId are required for logs view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}/logs`;
        description = `Execution logs for flow '${flowId}'`;
        instructions =
          "This page shows all log output from your flow execution. You can filter by task, log level, and search through the logs to debug issues or verify expected behavior.";
        break;

      case "flow":
        if (!flowId) {
          throw new Error("flowId is required for flow view");
        }
        url = `${KESTRA_BASE_URL}/ui/flows/${namespace}/${flowId}`;
        description = `Flow definition for '${flowId}'`;
        instructions = "This page shows your flow definition, allows you to edit the YAML, view the flow graph, and see execution history. You can also manually trigger new executions from here.";
        break;

      case "namespace":
        url = `${KESTRA_BASE_URL}/ui/flows?namespace=${namespace}`;
        description = `All flows in namespace '${namespace}'`;
        instructions = "This page lists all flows in your namespace. You can see flow status, recent executions, and create new flows. Use this to get an overview of all your automation.";
        break;

      case "gantt":
        if (!flowId || !executionId) {
          throw new Error(
            "Both flowId and executionId are required for gantt view"
          );
        }
        url = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${flowId}/${executionId}/gantt`;
        description = `Gantt chart for flow '${flowId}' execution`;
        instructions = "This page shows a timeline view of your flow execution with task durations, dependencies, and parallel execution. Great for understanding performance and identifying bottlenecks.";
        break;

      default:
        throw new Error(`Unknown view type: ${viewType}`);
    }

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
export const generateWorkflowLinksTool = createTool({
  id: "generate-workflow-links-tool",
  description: `Generates a comprehensive set of Kestra UI links for a workflow execution. Use this to provide users with all the important links they might need to explore their workflow.`,
  inputSchema: z.object({
    namespace: z.string().describe("Kestra namespace"),
    workflowId: z.string().describe("Workflow ID"),
    executionId: z.string().optional().describe("Execution ID (if available)"),
  }),
  outputSchema: z.object({
    workflowUrl: z.string().describe("URL to view the workflow definition"),
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
      .describe("URL to view all workflows in the namespace"),
    summary: z
      .string()
      .describe("Summary of available links and their purposes"),
  }),
  execute: async ({ context: { namespace, workflowId, executionId } }) => {
    const workflowUrl = `${KESTRA_BASE_URL}/ui/flows/${namespace}/${workflowId}`;
    const namespaceUrl = `${KESTRA_BASE_URL}/ui/flows?namespace=${namespace}`;

    let executionUrl: string | undefined;
    let topologyUrl: string | undefined;
    let logsUrl: string | undefined;
    let ganttUrl: string | undefined;

    if (executionId) {
      executionUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${workflowId}/${executionId}`;
      topologyUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${workflowId}/${executionId}/topology`;
      logsUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${workflowId}/${executionId}/logs`;
      ganttUrl = `${KESTRA_BASE_URL}/ui/executions/${namespace}/${workflowId}/${executionId}/gantt`;
    }

    let summary = `Here are the Kestra UI links for your workflow '${workflowId}':

🔧 **Workflow Definition**: View and edit your workflow YAML
📊 **Namespace Overview**: See all workflows in '${namespace}'`;

    if (executionId) {
      summary += `
📈 **Execution Details**: Complete execution information and results
🌐 **Topology View**: Visual graph showing task flow and status  
📋 **Execution Logs**: All output and debug information
📅 **Timeline View**: Gantt chart showing task durations and dependencies`;
    } else {
      summary += `
💡 **Tip**: Once you execute the workflow, you'll get additional links for execution details, topology view, and logs.`;
    }

    return {
      workflowUrl,
      executionUrl,
      topologyUrl,
      logsUrl,
      ganttUrl,
      namespaceUrl,
      summary,
    };
  },
});
