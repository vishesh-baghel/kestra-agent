import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { SummarizationMetric } from "@mastra/evals/llm";
import {
  ContentSimilarityMetric,
  ToneConsistencyMetric,
} from "@mastra/evals/nlp";
import * as tools from "../tools";
import { storage, vector, embedder } from "../db";
import { z } from "zod";
import { createTool } from "@mastra/core";
// Direct imports to avoid circular dependency
import { kestraFlowDesignAgent } from "./kestra-flow-design-agent";
import { kestraFlowExecutionAgent } from "./kestra-flow-execution-agent";

export const kestraAgent = new Agent({
  name: "Kestra Workflow Agent",
  instructions: `
You are a Kestra Workflow Agent that helps users create, validate, and execute Kestra flows using natural language.

## Key Functions:
- Convert user requests into valid Kestra YAML flows
- Validate and execute flows in Kestra
- Fix errors based on Kestra API responses
- Generate Kestra UI links for visual flow inspection
- Research best practices for business processes

## New Flow Creation Process:
1. Understand requirements and ask for a flow name
2. Research best practices and Kestra syntax
3. Create, validate and execute the flow
4. Provide Kestra UI links and explain the flow

## Flow Modification Process:
1. Understand requested changes
2. Modify, validate and execute the updated flow
3. Provide updated UI links and explain changes

## IMPORTANT: HOW TO HANDLE WORKFLOW SUSPENSION
1. Start by calling runWorkflow when a user wants to create a new flow
2. The workflow will be suspended at the 'get-user-requirements' step waiting for user input
3. When workflow is suspended:
   - Check the suspended step ID (e.g., 'get-user-requirements')
   - Collect required inputs from the user based on the suspended step:
     * For 'get-user-requirements': collect businessProcess and processGoals
     * For 'approval': collect approved (boolean) and optional flowFeedback
   - Use resumeWorkflow with the stepId and collected inputs
4. If you need to check status without restarting, use checkWorkflowStatus

## WORKING WITH USER REQUIREMENTS
If the workflow is suspended at 'get-user-requirements':
- Use the resumeWorkflow tool with businessProcess and processGoals
- Accept simple requirements like "print a log message" as valid
- Don't repeatedly ask for more information if user has already provided it
- Ensure businessProcess and processGoals are set even if they are simple

When using resumeWorkflow for 'get-user-requirements', always provide:
- businessProcess: The user's description of what the flow should do (even if simple)
- processGoals: Simplified goals based on the user's requirements (even if simple)

Example: If user says "create a flow that just prints a log", use:
- businessProcess: "Print a log message"
- processGoals: "Output a log entry"

## Best Practices for Tool Usage
- Use runWorkflow ONLY ONCE to start flow creation
- Use resumeWorkflow to continue after suspension
- Use checkWorkflowStatus to monitor without restarting
- Always include the stepId when resuming a suspended workflow
- Use createFlowTool ONLY ONCE per conversation
- For syntax research: try kestraDocsTool once, then webSearchTool
- Limit total tool calls to max 8 per user request

## Flow Naming Guidelines:
- Ask for flow name ONLY when creating the first flow
- User-provided names are converted to kebab-case
- Random flow IDs are generated for conflicts or when no name is provided

## Error Handling:
- Analyze errors, research correct syntax, and fix issues
- Re-test until successful and explain fixes

Remember to explain technical concepts in simple terms while ensuring flows are functional.
`,
  model: openai("gpt-4o-mini"),
  tools: {
    // ...tools,
    runWorkflow: createTool({
      id: "run-workflow",
      description:
        "Start the Kestra flow generation workflow and stream progress",
      inputSchema: z.object({
        businessProcess: z.string().optional(),
        processGoals: z.string().optional(),
        namespace: z.string().optional().default("company.team"),
        stream: z.boolean().optional().default(true),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        status: z.string().optional(),
        message: z.string().optional(),
        stepId: z.string().optional(),
        yaml: z.string().optional(),
        kestraUrl: z.string().optional(),
        flowUrl: z.string().optional(),
        executionUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async ({ context, mastra }, options) => {
        // Use type assertion to access writer property that exists at runtime
        const writer = options && (options as any).writer;
        const { businessProcess, processGoals, namespace, stream } = context;
        if (!mastra) {
          return { success: false, error: "Mastra instance not available" };
        }

        try {
          const workflow = mastra.getWorkflow("kestraFlowGeneration");
          if (!workflow) {
            return { success: false, error: "Workflow not found" };
          }

          const run = await workflow.createRunAsync();

          // If streaming is requested and writer is available
          // Only stream if writer is available and streaming is enabled
          if (stream && writer) {
            // Start the workflow with streaming
            writer.write({
              type: "workflow-stream",
              status: "starting",
              message: "Starting Kestra flow generation workflow...",
            });

            try {
              // Stream the workflow progress
              const workflowStream = await run.streamVNext({
                inputData: { namespace: namespace || "company.team" },
              });

              // Pipe the workflow stream directly to the writer
              await workflowStream.pipeTo(writer);

              // After streaming is complete, get the final result
              const finalStatus = await workflowStream.status;
              const finalResult = await workflowStream.result;

              if (finalStatus === "suspended") {
                return {
                  success: true,
                  status: "suspended",
                  message:
                    "Workflow is waiting for your business requirements. Please provide details about the business process you want to automate.",
                  stepId: finalResult?.suspended?.[0]?.[0] || null,
                };
              } else if (finalStatus === "success") {
                return {
                  success: true,
                  status: "complete",
                  message: finalResult?.message || "Flow created successfully",
                  yaml: finalResult?.yaml,
                  kestraUrl: finalResult?.kestraUrl,
                  flowUrl: finalResult?.flowUrl,
                  executionUrl: finalResult?.executionUrl,
                };
              } else {
                return {
                  success: false,
                  error: finalResult?.error || "Workflow failed",
                  status: finalStatus,
                };
              }
            } catch (streamError) {
              const streamErrorMessage =
                streamError instanceof Error
                  ? streamError.message
                  : "Error during workflow streaming";
              writer.write({
                type: "workflow-stream",
                status: "error",
                message: `Error streaming workflow: ${streamErrorMessage}`,
              });
              throw streamError;
            }
          } else {
            // Non-streaming execution (fallback)
            const result = await run.start({
              inputData: { namespace: namespace || "company.team" },
            });

            if (result.status === "suspended") {
              return {
                success: true,
                status: "suspended",
                message:
                  "Workflow is waiting for your business requirements. Please provide details about the business process you want to automate.",
                stepId: result.suspended?.[0]?.[0] || null,
              };
            } else if (result.status === "success") {
              return {
                success: true,
                status: "complete",
                message: result.result?.message || "Flow created successfully",
                yaml: result.result?.yaml,
                kestraUrl: result.result?.kestraUrl,
                flowUrl: result.result?.flowUrl,
                executionUrl: result.result?.executionUrl,
              };
            } else {
              return {
                success: false,
                error: result.error || "Workflow failed",
                status: result.status,
              };
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    }),
    resumeWorkflow: createTool({
      id: "resume-workflow",
      description:
        "Resume the Kestra flow generation workflow from a suspended state with user-provided input and stream progress",
      inputSchema: z.object({
        stepId: z.string().describe("ID of the suspended step to resume from (e.g., 'get-user-requirements', 'approval')"),
        businessProcess: z.string().optional().describe("Detailed description of the business process provided by the user"),
        processGoals: z.string().optional().describe("Key goals and outcomes of the process provided by the user"),
        approved: z.boolean().optional().describe("Whether the user has approved the generated flow"),
        flowFeedback: z.string().optional().describe("Feedback provided by the user about the generated flow"),
        stream: z.boolean().optional().default(true),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        status: z.string().optional(),
        message: z.string().optional(),
        stepId: z.string().optional(),
        yaml: z.string().optional(),
        kestraUrl: z.string().optional(),
        flowUrl: z.string().optional(),
        executionUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async ({ context, mastra }, options) => {
        // Use type assertion to access writer property that exists at runtime
        const writer = options && (options as any).writer;
        const {
          stepId,
          businessProcess,
          processGoals,
          approved,
          flowFeedback,
          stream,
        } = context;
        
        // Validate required inputs based on step
        if (stepId === "get-user-requirements" && (!businessProcess || !processGoals)) {
          return { 
            success: false, 
            error: "Both businessProcess and processGoals are required when resuming from 'get-user-requirements' step" 
          };
        }
        
        if (stepId === "approval" && (approved === undefined)) {
          return { 
            success: false, 
            error: "The 'approved' field is required when resuming from 'approval' step" 
          };
        }
        if (!mastra) {
          return { success: false, error: "Mastra instance not available" };
        }

        try {
          const workflow = mastra.getWorkflow("kestraFlowGeneration");
          if (!workflow) {
            return { success: false, error: "Workflow not found" };
          }

          const run = await workflow.createRunAsync();

          // Prepare the resume data based on step ID
          let resumeData;
          if (stepId === "get-user-requirements") {
            resumeData = { businessProcess, processGoals };
          } else if (stepId === "approval") {
            resumeData = { approved, flowFeedback };
          } else {
            return { success: false, error: "Unknown step ID" };
          }

          // If streaming is requested and writer is available
          // Only stream if writer is available and streaming is enabled
          if (stream && writer) {
            // Start the workflow with streaming
            writer.write({
              type: "workflow-stream",
              status: "resuming",
              message: `Resuming Kestra flow generation workflow from step ${stepId}...`,
            });

            try {
              // Stream the workflow progress
              const workflowStream = await run.streamVNext({
                step: stepId,
                resumeData,
              });

              // Pipe the workflow stream directly to the writer
              await workflowStream.pipeTo(writer);

              // After streaming is complete, get the final result
              const finalStatus = await workflowStream.status;
              const finalResult = await workflowStream.result;

              if (finalStatus === "suspended") {
                return {
                  success: true,
                  status: "suspended",
                  message: "Workflow is waiting for additional input.",
                  stepId: finalResult?.suspended?.[0]?.[0] || null,
                };
              } else if (finalStatus === "success") {
                return {
                  success: true,
                  status: "complete",
                  message: finalResult?.message || "Flow created successfully",
                  yaml: finalResult?.yaml,
                  kestraUrl: finalResult?.kestraUrl,
                  flowUrl: finalResult?.flowUrl,
                  executionUrl: finalResult?.executionUrl,
                };
              } else {
                return {
                  success: false,
                  error: finalResult?.error || "Workflow failed",
                  status: finalStatus,
                };
              }
            } catch (streamError) {
              const streamErrorMessage =
                streamError instanceof Error
                  ? streamError.message
                  : "Error during workflow streaming";
              writer.write({
                type: "workflow-stream",
                status: "error",
                message: `Error streaming workflow: ${streamErrorMessage}`,
              });
              throw streamError;
            }
          } else {
            // Non-streaming execution (fallback)
            let result;

            if (stepId === "get-user-requirements") {
              result = await run.resume({
                step: stepId,
                resumeData: { businessProcess, processGoals },
              });
            } else if (stepId === "approval") {
              result = await run.resume({
                step: stepId,
                resumeData: { approved, flowFeedback },
              });
            } else {
              return { success: false, error: "Unknown step ID" };
            }

            if (result.status === "suspended") {
              // Still waiting for more user input
              return {
                success: true,
                status: "suspended",
                message: "Workflow is waiting for additional input.",
                stepId: result.suspended?.[0]?.[0] || null,
              };
            } else if (result.status === "success") {
              return {
                success: true,
                status: "complete",
                message: result.result?.message || "Flow created successfully",
                yaml: result.result?.yaml,
                kestraUrl: result.result?.kestraUrl,
                flowUrl: result.result?.flowUrl,
                executionUrl: result.result?.executionUrl,
              };
            } else {
              return {
                success: false,
                error: result.error || "Workflow failed",
                status: result.status,
              };
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : String(error) || "Unknown error occurred";
          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    }),
    // useDesignAgent: createTool({
    //   id: "use-design-agent",
    //   description: "Use the specialized Kestra flow design agent",
    //   inputSchema: z.object({
    //     prompt: z.string(),
    //   }),
    //   outputSchema: z.object({
    //     success: z.boolean(),
    //     response: z.string().optional(),
    //     error: z.string().optional(),
    //   }),
    //   execute: async ({ context }) => {
    //     const { prompt } = context;
    //     try {
    //       const result = await kestraFlowDesignAgent.generate([
    //         { role: "user", content: prompt },
    //       ]);
    //       return { success: true, response: result.text };
    //     } catch (error) {
    //       const errorMessage =
    //         error instanceof Error
    //           ? error.message
    //           : "Failed to use design agent";
    //       return { success: false, error: errorMessage };
    //     }
    //   },
    // }),
    // useExecutionAgent: createTool({
    //   id: "use-execution-agent",
    //   description: "Use the specialized Kestra flow execution agent",
    //   inputSchema: z.object({
    //     prompt: z.string(),
    //   }),
    //   outputSchema: z.object({
    //     success: z.boolean(),
    //     response: z.string().optional(),
    //     error: z.string().optional(),
    //   }),
    //   execute: async ({ context }) => {
    //     const { prompt } = context;
    //     try {
    //       const result = await kestraFlowExecutionAgent.generate([
    //         { role: "user", content: prompt },
    //       ]);
    //       return { success: true, response: result.text };
    //     } catch (error) {
    //       const errorMessage =
    //         error instanceof Error
    //           ? error.message
    //           : "Failed to use execution agent";
    //       return { success: false, error: errorMessage };
    //     }
    //   },
    // }),
    checkWorkflowStatus: createTool({
      id: "check-workflow-status",
      description: "Check the status of a running Mastra workflow execution",
      inputSchema: z.object({
        executionId: z.string().optional(),
        stream: z.boolean().optional().default(true),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        status: z.string().optional(),
        message: z.string().optional(),
        currentStep: z.string().optional(),
        suspended: z.boolean().optional(),
        suspendedAt: z.string().optional(),
        executionId: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async ({ context, mastra }, options) => {
        const writer = options && (options as any).writer;
        const { executionId, stream } = context;

        if (!mastra) {
          return { success: false, error: "Mastra instance not available" };
        }

        try {
          const workflow = mastra.getWorkflow("kestraFlowGeneration");
          if (!workflow) {
            return { success: false, error: "Workflow not found" };
          }

          if (stream && writer) {
            writer.write({
              type: "workflow-stream",
              status: "checking",
              message: `Checking status of Mastra workflow execution...`,
            });
          }

          // Check if we're looking at a specific execution or the latest one
          let run;
          if (executionId) {
            // In production, this would retrieve a specific run by ID
            // Since there's no direct API for this, we'll create a new run and check its status
            // This is just for demonstration; in production, you'd implement proper run storage/retrieval
            run = await workflow.createRunAsync();
          } else {
            // Create a new run to check workflow status
            run = await workflow.createRunAsync();
          }

          // Get the current status and result of the workflow
          const currentStatus = await run.status;
          let currentResult;
          try {
            // Only try to get result if status is not suspended (would throw error)
            if (currentStatus !== "suspended") {
              currentResult = await run.result;
            }
          } catch (error) {
            // Ignore result error if workflow is suspended
          }

          // Build status response
          const statusResponse = {
            executionId: executionId || run.id,
            status: currentStatus,
            suspended: currentStatus === "suspended",
            // If suspended, include the suspended step info
            ...(currentStatus === "suspended" && {
              currentStep: run.result?.suspended?.[0]?.[0] || "unknown",
              suspendedAt: run.result?.suspended?.[0]?.[0] || "unknown",
              message: `Workflow is suspended at step '${run.result?.suspended?.[0]?.[0] || "unknown"}' waiting for input.`,
            }),
            // If not suspended, include any result data
            ...(currentStatus !== "suspended" &&
              currentResult && {
                currentStep: "completed",
                message: `Workflow has ${currentStatus === "success" ? "completed successfully" : "failed"}.`,
                result: currentResult,
              }),
          };

          if (stream && writer) {
            writer.write({
              type: "workflow-stream",
              status: "status",
              data: statusResponse,
            });
          }

          return {
            success: true,
            ...statusResponse,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to check workflow status";
          if (stream && writer) {
            writer.write({
              type: "workflow-stream",
              status: "error",
              message: errorMessage,
            });
          }
          return { success: false, error: errorMessage };
        }
      },
    }),
  },
  memory: new Memory({
    storage,
    vector,
    embedder,
    options: {
      lastMessages: 5,
      semanticRecall: {
        topK: 5,
        messageRange: 5,
        scope: "resource",
      },
      threads: {
        generateTitle: true,
      },
      workingMemory: {
        enabled: true,
      },
    },
  }),
  evals: {
    summarization: new SummarizationMetric(openai("gpt-4o-mini")),
    contentSimilarity: new ContentSimilarityMetric(),
    tone: new ToneConsistencyMetric(),
  },
});
