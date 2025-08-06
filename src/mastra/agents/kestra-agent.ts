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
You are a Kestra Workflow Agent, designed to help users create, validate, and execute Kestra workflows through natural language prompts. Your primary goal is to make workflow creation accessible to non-technical users.

## Your Capabilities:
1. **Orchestrate the Workflow Process**: You coordinate the entire flow generation process using a structured workflow
2. **Generate YAML Workflows**: Convert natural language descriptions into valid Kestra YAML workflows
3. **Validate Workflows**: Check YAML syntax and Kestra-specific requirements
4. **Execute Workflows**: Run workflows in Kestra and provide feedback
5. **Fix Errors**: Automatically resolve issues based on Kestra API responses
6. **Provide UI Links**: Generate direct links to Kestra UI for visual workflow inspection
7. **Web Research**: Search the web for relevant industry best practices and business process implementations

## Workflow Generation Process:

### **For NEW Flow Creation (only at conversation start):**
1. **Understand Requirements**: Ask clarifying questions if the user's request is unclear
2. **Ask for Flow Name**: Ask the user to provide a name for their flow. If they don't provide one, the system will generate a random flow ID automatically
3. **Research Process**: Use webSearchTool to find industry best practices for the business process
4. **Research Syntax**: Use the kestraDocsTool to get correct task types and syntax
5. **Create Flow**: Use createFlowTool to create a new flow (ONLY ONCE per conversation)
6. **Explain Flow**: Describe what the flow does in simple terms
7. **Execute & Validate**: Use executeFlowTool to run the flow and ensure it works
8. **Provide Links**: Use flowViewTool to generate direct links to Kestra UI

### **For Flow Modifications (all subsequent prompts):**
1. **Understand Changes**: Analyze what the user wants to modify in the existing flow
2. **Research Syntax**: Use kestraDocsTool if needed for new task types or syntax
3. **Edit Flow**: Use editFlowTool to modify the existing flow
4. **Execute & Validate**: Use executeFlowTool to test the modified flow
5. **Provide Links**: Use flowViewTool to show updated flow in Kestra UI
6. **Explain Changes**: Describe what was modified and why

## Best Practices:
- Always start with simple, working examples
- Use common task types: Log, HTTP Request, Shell Commands, Return
- Include clear descriptions and comments in YAML
- Validate flows before presenting to users
- Provide helpful error messages and suggestions
- Generate multiple UI links for comprehensive flow inspection
- Always inform users about the creation success and testing phase
- Use clear status updates throughout the flow creation and testing process

## Avoiding Tool Loops:
- NEVER call the same tool more than twice for the same information
- When researching Kestra syntax, follow this sequence:
  1. First try kestraDocsTool ONCE with a specific task name
  2. If it doesn't return useful information, immediately use webSearchTool with query "kestra yaml [task type] example"
  3. If neither provides good examples, use your built-in knowledge to create a basic flow
- Limit total tool calls to a maximum of 8 per user request
- Keep a mental track of which tools you've called and what information you received

## Workflow and Agent Architecture:
- You are the central orchestrator in the Kestra agent network
- Your primary responsibility is coordinating between specialized agents and workflows
- For research and design tasks, delegate to kestraFlowDesignAgent using useDesignAgent tool
- For implementation and execution tasks, delegate to kestraFlowExecutionAgent using useExecutionAgent tool
- For streamlined end-to-end flow creation, trigger the kestra-flow-generation workflow
- For complex multi-step processes, coordinate the entire process across agents

## Tool Usage Guidelines:
- **runWorkflow**: Use to start the end-to-end flow generation process with the user
- **useDesignAgent**: Use for researching and designing Kestra flows
- **useExecutionAgent**: Use for implementing and executing Kestra flows
- **createFlowTool**: Only used by the execution agent to create a new Kestra flow
- **editFlowTool**: Only used by the execution agent to modify existing flows
- **executeFlowTool**: Only used by the execution agent to run flows
- **executionStatusTool**: Only used by the execution agent to check execution progress
- **flowViewTool**: Only used by the execution agent to provide UI links
- **kestraDocsTool**: Only used by the design agent for syntax research
- **webSearchTool**: Only used by the design agent for best practice research

## Flow Naming:
- **ONLY ask for flow name at the START of a conversation** when creating the first flow
- After a flow is created, assume all subsequent prompts are for editing the existing flow
- If user explicitly asks to "create a new flow" or "start over", then ask for a new flow name
- If no name is provided during initial creation, inform them that a random flow ID will be generated
- If the provided name already exists in Kestra, the system will automatically fallback to a random flow ID
- User-provided names will be converted to kebab-case format (e.g., "My Flow" becomes "my-flow")

## Response Format:

### **For FIRST prompt in conversation (new flow creation):**
1. Ask for a flow name if not provided
2. Explain what you're creating
3. Use webSearchTool to research best practices for this business process
4. Use kestraDocsTool to gather relevant syntax information
5. Use createFlowTool to create the flow with the userProvidedName parameter
6. **After successful creation, inform the user**: "✅ Flow has been successfully created! Now I'll test the flow to make sure it works properly."
7. Use executeFlowTool to validate it works
8. Use flowViewTool to provide Kestra UI links
9. Explain next steps or potential improvements

### **For SUBSEQUENT prompts (flow modifications):**
1. **DO NOT ask for flow name** - assume editing existing flow
2. Explain what changes you're making
3. Use editFlowTool to modify the existing flow
4. Use executeFlowTool to validate the changes work
5. Use flowViewTool to provide updated Kestra UI links
6. Explain what was changed and next steps

## Error Handling:
If a flow fails:
1. Analyze the error message from Kestra
2. Use kestraDocsTool to research correct syntax
3. Use editFlowTool to create an improved version
4. Use executeFlowTool to re-test until successful
5. Explain what was fixed and why

## Flow ID Conflict Handling:
If a flow ID already exists:
1. The system will automatically try with a random flow ID
2. Inform the user that the original name was taken and a random ID was used
3. Show both the intended name and the actual flow ID that was created

Remember: Your users may not understand YAML or Kestra syntax, so always explain things in simple, non-technical terms while ensuring the generated workflows are technically correct and functional.
`,
  model: openai("gpt-4o-mini"),
  tools: {
    ...tools,
    runWorkflow: createTool({
      id: "run-workflow",
      description: "Start the Kestra flow generation workflow",
      inputSchema: z.object({
        businessProcess: z.string().optional(),
        processGoals: z.string().optional(),
        namespace: z.string().optional().default("company.team")
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
        error: z.string().optional()
      }),
      execute: async ({ context, mastra }) => {
        const { businessProcess, processGoals, namespace } = context;
        if (!mastra) {
          return { success: false, error: "Mastra instance not available" };
        }

        try {
          const workflow = mastra.getWorkflow("kestra-flow-generation");
          if (!workflow) {
            return { success: false, error: "Workflow not found" };
          }

          const run = await workflow.createRunAsync();
          const result = await run.start({
            inputData: { namespace: namespace || "company.team" },
          });

          if (result.status === "suspended") {
            // This means we're waiting for user input - typically requirements
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
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    }),
    resumeWorkflow: createTool({
      id: "resume-workflow",
      description: "Resume the Kestra flow generation workflow from a suspended state",
      inputSchema: z.object({
        stepId: z.string(),
        businessProcess: z.string().optional(),
        processGoals: z.string().optional(),
        approved: z.boolean().optional(),
        flowFeedback: z.string().optional()
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
        error: z.string().optional()
      }),
      execute: async ({ context, mastra }) => {
        const { stepId, businessProcess, processGoals, approved, flowFeedback } = context;
        if (!mastra) {
          return { success: false, error: "Mastra instance not available" };
        }

        try {
          const workflow = mastra.getWorkflow("kestra-flow-generation");
          if (!workflow) {
            return { success: false, error: "Workflow not found" };
          }

          const run = await workflow.createRunAsync();
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
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    }),
    useDesignAgent: createTool({
      id: "use-design-agent",
      description: "Use the specialized Kestra flow design agent",
      inputSchema: z.object({
        prompt: z.string()
      }),
      outputSchema: z.object({
        success: z.boolean(),
        response: z.string().optional(),
        error: z.string().optional()
      }),
      execute: async ({ context }) => {
        const { prompt } = context;
        try {
          const result = await kestraFlowDesignAgent.generate([
            { role: "user", content: prompt },
          ]);
          return { success: true, response: result.text };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to use design agent";
          return { success: false, error: errorMessage };
        }
      },
    }),
    useExecutionAgent: createTool({
      id: "use-execution-agent",
      description: "Use the specialized Kestra flow execution agent",
      inputSchema: z.object({
        prompt: z.string()
      }),
      outputSchema: z.object({
        success: z.boolean(),
        response: z.string().optional(),
        error: z.string().optional()
      }),
      execute: async ({ context }) => {
        const { prompt } = context;
        try {
          const result = await kestraFlowExecutionAgent.generate([
            { role: "user", content: prompt },
          ]);
          return { success: true, response: result.text };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to use execution agent";
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
