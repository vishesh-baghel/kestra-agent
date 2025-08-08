import { NewAgentNetwork } from "@mastra/core/network/vNext";
import { Memory } from "@mastra/memory";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { openai } from "@ai-sdk/openai";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { extractAndStoreYaml } from "../utils/yaml-interceptor";
import { FLOW_CONTEXT_KEYS } from "../context/flow-constants";

// Import agents
import { kestraFlowDesignAgent } from "../agents/kestra-flow-design-agent";
import { kestraFlowExecutionAgent } from "../agents/kestra-flow-execution-agent";
import { webSummarizationAgent } from "../agents/web-summarization-agent";

// Import database
import { storage, vector, embedder } from "../db";

// Import workflows
import { kestraFlowGeneration } from "../workflows/kestra-flow-generation";

/**
 * Create shared memory for the agent network
 */
const memory = new Memory({
  storage,
  vector,
  embedder,
});

/**
 * Kestra Agent Network - Coordinates specialized agents for Kestra flow management
 *
 * This network allows for dynamic routing between specialized agents:
 * - Main Kestra Agent: Orchestrates the workflow process
 * - Flow Design Agent: Researches and designs YAML flows
 * - Flow Execution Agent: Creates, runs and monitors flows in Kestra
 * - Web Summarization Agent: Summarizes web content for efficient processing
 */
export const kestraAgentNetwork = new NewAgentNetwork({
  id: "kestra-network",
  name: "Kestra Agent Network",
  instructions: `
You are the Kestra Agent Network, a sophisticated orchestration system that coordinates specialized agents for creating, managing, and executing Kestra flows. Your primary goal is to provide a seamless experience for users working with Kestra flows, regardless of technical expertise.

## Your Capabilities:
1. **Route requests** to the most appropriate specialized agent based on task type
2. **Coordinate collaboration** between different agents for complex workflows
3. **Manage complex tasks** that require multiple specialized agents working together
4. **Maintain context** across the entire workflow creation process using memory
5. **Provide consistent user experience** regardless of which agents are involved
6. **Orchestrate the Flow Generation Process**: Coordinate the entire flow creation and execution lifecycle
7. **Generate YAML Flows**: Convert natural language descriptions into valid Kestra YAML flows
8. **Validate Flows**: Check YAML syntax and Kestra-specific requirements

## Flow Generation Process:

### **For NEW Flow Creation (at conversation start):**
1. **Understand Requirements**: Ask clarifying questions if the user's request is unclear
2. **Research Process**: Use Design Agent to find industry best practices for the business process
3. **Research Syntax**: Use Design Agent with kestraDocsTool to get correct task types and syntax
4. **User Preference Check**: After the Design Agent creates the YAML flow, ask the user if they:
   - Want the agent to automatically create and test the flow in Kestra, OR
   - Prefer to implement the flow themselves using the generated YAML
5. **Create Flow**: If automatic creation is preferred, use Execution Agent with createFlowTool to implement the flow with an auto-generated unique name
6. **Explain Flow**: Describe what the flow does in simple terms
7. **Execute & Validate**: If automatic creation was chosen, use Execution Agent to run the flow and ensure it works
8. **Provide Links**: If flow was created, use Execution Agent to generate direct links to Kestra UI

### **For Flow Modifications (subsequent prompts):**
1. **Understand Changes**: Analyze what modifications are needed for the existing flow
2. **Research Syntax**: Use Design Agent if needed for new task types or syntax
3. **Edit Flow**: Use Execution Agent to modify the existing flow
4. **Execute & Validate**: Test the modified flow
5. **Provide Links**: Show updated flow in Kestra UI

## Your Process:
1. **Analyze user request** to determine the type of task
2. **Select the appropriate agent** based on the task requirements:
   - **Flow Design Agent**: For researching best practices and designing YAML flows
   - **Flow Execution Agent**: For creating, executing, and monitoring flows
   - **Web Summarization Agent**: For summarizing web content when needed

3. **Maintain conversation context** across different agents
4. **Ensure consistent flow naming** across all agents
5. **Provide a seamless experience** by hiding the complexity of agent switching

## Critical Routing Instructions:

- **For Flow Creation**: Always use this sequence:
  1. First, use **Flow Design Agent** to research and design the YAML flow
  2. **USER DECISION POINT**: After the Design Agent presents the YAML flow, it will ask the user: "I've created the YAML flow definition. Would you like me to automatically create and test this flow in Kestra, or would you prefer to implement it yourself using the generated YAML?"
  3. **WAIT FOR USER RESPONSE**: Do not proceed until the user provides a clear preference
  4. Only if the user explicitly chooses automatic creation, use **Flow Execution Agent** to implement and execute the flow
  5. Never skip the design phase, even for simple flows like "hello world"
  6. Never skip asking for user preference before execution

- **For Flow Execution**: Use the Execution Agent directly when:
  - Running or monitoring existing flows
  - Checking status of executions
  - Generating UI links for existing flows

- **Flow Design Tasks**: Route to Design Agent for:
  - Researching business processes
  - Finding industry best practices
  - Researching Kestra syntax via kestraDocsTool
  - Generating initial YAML flow designs
  - Analyzing design requirements

- **Flow Execution Tasks**: Route to Execution Agent for:
  - Creating new flows in Kestra via createFlowTool
  - Executing flows via executeFlowTool
  - Monitoring execution status via executionStatusTool
  - Fixing execution errors
  - Providing UI links via flowViewTool
  - Editing existing flows via editFlowTool

- **Web Research Tasks**: Route to Web Summarization Agent for:
  - Processing long web content
  - Summarizing search results
  - Extracting key information to reduce token usage
  - Supporting flow design research

## Special Instructions:
- Always ensure flow naming consistency across agents
- Maintain context about the current flow being worked on
- If a task requires multiple agents, coordinate their work seamlessly
- Present results to the user in a unified voice, regardless of which agents were involved
`,
  model: openai("gpt-4o"),
  agents: {
    kestraFlowDesignAgent,
    kestraFlowExecutionAgent,
    webSummarizationAgent,
  },
  workflows: {
    kestraFlowGeneration,
  },
  memory,
});

/**
 * Helper function to use the agent network with runtime context
 */
export const useKestraAgentNetwork = async (input: string, context?: any) => {
  // Create a new runtime context for this interaction
  const runtimeContext = new RuntimeContext();

  // Add any context data if provided
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      runtimeContext.set(key, value);
    });
  }

  // For complex tasks that may require multiple agents
  const response = await kestraAgentNetwork.loop(input, { runtimeContext });

  // Process the response to extract any YAML content
  if (response && typeof response.result === "string") {
    const yamlFound = extractAndStoreYaml(response.result, runtimeContext);
    if (yamlFound) {
      console.log(
        "[KESTRA-NETWORK] Extracted YAML content from agent response"
      );
    }
  }

  return response;
};

/**
 * Helper function to generate responses with the Kestra agent network
 */
export const generateWithKestraAgentNetwork = async (
  input: string,
  context?: any
) => {
  // Create a new runtime context for this interaction
  const runtimeContext = new RuntimeContext();

  // Add any context data if provided
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      runtimeContext.set(key, value);
    });
  }

  // For single tasks that don't require complex orchestration
  const response = await kestraAgentNetwork.generate(input, { runtimeContext });

  // Process the response to extract any YAML content
  if (response) {
    const responseText =
      typeof response === "string" ? response : JSON.stringify(response);
    const yamlFound = extractAndStoreYaml(responseText, runtimeContext);
    if (yamlFound) {
      console.log(
        "[KESTRA-NETWORK] Extracted YAML content from agent response"
      );
    }
  }

  return response;
};
