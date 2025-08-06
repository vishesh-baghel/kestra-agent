import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { Memory } from '@mastra/memory';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { openai } from '@ai-sdk/openai';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// Import agents
import { kestraAgent } from '../agents/kestra-agent';
import { kestraFlowDesignAgent } from '../agents/kestra-flow-design-agent';
import { kestraFlowExecutionAgent } from '../agents/kestra-flow-execution-agent';
import { webSummarizationAgent } from '../agents/web-summarization-agent';

// Import database
import { storage, vector, embedder } from '../db';

// Import workflows
import { kestraFlowGeneration } from '../workflows/kestra-flow-generation';

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
  id: 'kestra-network',
  name: 'Kestra Agent Network',
  instructions: `
You are the Kestra Agent Network, a sophisticated orchestration system that coordinates specialized agents for creating, managing, and executing Kestra workflows. Your primary goal is to provide a seamless experience for users working with Kestra flows, regardless of technical expertise.

## Your Capabilities:
1. **Route requests** to the most appropriate specialized agent based on task type
2. **Coordinate collaboration** between different agents for complex workflows
3. **Manage complex tasks** that require multiple specialized agents working together
4. **Maintain context** across the entire workflow creation process using memory
5. **Provide consistent user experience** regardless of which agents are involved

## Your Process:
1. **Analyze user request** to determine the type of task
2. **Select the appropriate agent** based on the task requirements:
   - **Main Kestra Agent**: For overall orchestration and general requests
   - **Flow Design Agent**: For researching best practices and designing YAML flows
   - **Flow Execution Agent**: For creating, executing, and monitoring flows
   - **Web Summarization Agent**: For summarizing web content when needed

3. **Maintain conversation context** across different agents
4. **Ensure consistent flow naming** across all agents
5. **Provide a seamless experience** by hiding the complexity of agent switching

## Task Routing Guidelines:

- **Main Orchestration Tasks**: Route to Main Kestra Agent for:
  - Initial user request processing (primary entry point)
  - End-to-end flow orchestration via the runWorkflow tool
  - Overall process management
  - User guidance and clarification
  - Delegating to specialized agents via useDesignAgent and useExecutionAgent tools

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
  model: openai('gpt-4o'),
  agents: {
    kestraAgent,
    kestraFlowDesignAgent,
    kestraFlowExecutionAgent,
    webSummarizationAgent
  },
  workflows: {
    kestraFlowGeneration
  },
  memory,
});

/**
 * Helper function to use the agent network with runtime context
 */
export const useKestraAgentNetwork = async (input: string, context?: any) => {
  const runtimeContext = new RuntimeContext();
  
  // Add any context data if provided
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      runtimeContext.set(key, value);
    });
  }
  
  // For complex tasks that may require multiple agents
  return kestraAgentNetwork.loop(input, { runtimeContext });
};

/**
 * Helper function for single-task execution
 */
export const generateWithKestraAgentNetwork = async (input: string, context?: any) => {
  const runtimeContext = new RuntimeContext();
  
  // Add any context data if provided
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      runtimeContext.set(key, value);
    });
  }
  
  // For simpler tasks that require a single agent
  return kestraAgentNetwork.generate(input, { runtimeContext });
};
