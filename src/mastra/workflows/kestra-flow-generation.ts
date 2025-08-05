import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// Step 1: Get user requirements
const getUserRequirementsStep = createStep({
  id: "get-user-requirements",
  description: "Get detailed business process requirements from user",
  inputSchema: z.object({
    namespace: z.string().default("company.team"),
  }),
  outputSchema: z.object({
    businessProcess: z
      .string()
      .describe("Detailed description of the business process"),
    processGoals: z.string().describe("Key goals and outcomes of the process"),
  }),
  resumeSchema: z.object({
    businessProcess: z.string(),
    processGoals: z.string(),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ resumeData, suspend }) => {
    if (resumeData) {
      return resumeData;
    }

    await suspend({
      message:
        "Please describe the business process you want to automate with Kestra. Include specific details about inputs, outputs, and steps.",
    });

    return {
      businessProcess: "",
      processGoals: "",
    };
  },
});

// Step 2: Research similar flows
const researchSimilarFlowsStep = createStep({
  id: "research-similar-flows",
  description: "Research similar business flows to improve quality using both web search and agent knowledge",
  inputSchema: z.object({
    businessProcess: z.string(),
    processGoals: z.string(),
    namespace: z.string().default("company.team")
  }),
  outputSchema: z.object({
    researchData: z.any(),
    webResults: z.array(z.any()),
    bestPractices: z.array(z.string()),
    recommendedTasks: z.array(z.string())
  }),
  execute: async ({ inputData, mastra }) => {
    try {
      const agent = mastra.getAgent("kestra-agent");
      let webResults = [];
      
      // Step 1: Perform web search for industry best practices
      console.log("Performing web search for best practices");
      try {
        const webSearchQuery = `business process automation ${inputData.businessProcess} best practices kestra orchestration`;
        // Import and use the webSearchTool directly
        const { webSearchTool } = require("../tools/webSearchTool");
        const webSearchResult = await webSearchTool.execute({
          context: { query: webSearchQuery },
          mastra
        });
        webResults = webSearchResult?.results || [];
        console.log(`Found ${webResults.length} web search results`);
      } catch (webError) {
        console.error("Web search error:", webError);
        // Continue with agent research even if web search fails
      }

      // Step 2: Use agent to research and consolidate findings
      const webInfoText = webResults.length > 0 ?
        `Consider these web search findings:\n\n${webResults.map((r: any) => 
          `Source: ${r.title || 'Unknown source'} (${r.url || 'No URL'})\n${r.content || 'No content'}\n\n`
        ).join('')}` : "";

      const researchPrompt = `Research best practices for implementing this business process as a Kestra flow:\n\n"${inputData.businessProcess}"\n\nWith these goals: "${inputData.processGoals}"\n\n${webInfoText}\n\nIdentify:\n1. Similar workflow patterns\n2. Recommended Kestra tasks\n3. Best practices for implementation\n4. Common pitfalls to avoid\n\nIMPORTANT TOOL USAGE:\n- When researching Kestra task types, use kestraDocsTool ONLY ONCE per task type\n- If kestraDocsTool doesn't return useful information, immediately switch to webSearchTool with query "kestra yaml [task type] example"\n- Do not call the same tool repeatedly for the same information - alternate between tools instead\n\nReturn findings in structured format.`;

      const result = await agent.generate(
        [
          {
            role: "user",
            content: researchPrompt,
          },
        ],
        {
          experimental_output: z.object({
            similarPatterns: z.array(z.string()),
            recommendedTasks: z.array(z.string()),
            bestPractices: z.array(z.string()),
            pitfallsToAvoid: z.array(z.string())
          }),
        },
      );

      // Safely access result object properties with fallbacks
      const resultObject = result.object || {
        similarPatterns: [],
        recommendedTasks: [],
        bestPractices: [],
        pitfallsToAvoid: []
      };

      return {
        researchData: resultObject,
        webResults,
        bestPractices: resultObject.bestPractices || [],
        recommendedTasks: resultObject.recommendedTasks || []
      };
    } catch (error: any) {
      console.log({ error });
      return {
        researchData: { error: error.message },
        webResults: [],
        bestPractices: [`Error in research: ${error.message}`],
        recommendedTasks: ["log", "echo"],
      };
    }
  },
});

// Step 3: Generate YAML flow
const generateYamlStep = createStep({
  id: "generate-yaml",
  description: "Generate Kestra YAML flow from requirements and research",
  inputSchema: z.object({
    businessProcess: z.string(),
    processGoals: z.string(),
    researchData: z.any(),
    webResults: z.array(z.any()),
    bestPractices: z.array(z.string()),
    recommendedTasks: z.array(z.string()),
    namespace: z.string().default("company.team"),
    flowFeedback: z.string().optional(),
  }),
  outputSchema: z.object({
    flowYaml: z.string().describe("Generated YAML flow"),
    explanation: z.string().describe("Explanation of the generated flow"),
    flowId: z.string().describe("Generated flow ID"),
  }),
  execute: async ({ inputData }) => {
    const { businessProcess, processGoals, namespace, bestPractices, recommendedTasks, flowFeedback, webResults } = inputData;

    // Include feedback for improvement if it exists
    const feedbackSection = flowFeedback
      ? `\nPrevious feedback to incorporate:\n${flowFeedback}\n`
      : "";

    // Include web research results if available
    const webResearchSection = webResults && webResults.length > 0
      ? `\nConsider these web research findings:\n${webResults.map((r: any, i: number) =>
        `Source ${i + 1}: ${r.title || 'Unknown'} - ${r.url || 'No URL'}\n`
      ).join('')}\n`
      : "";

    const prompt = `
Create a Kestra flow YAML based on this business process:

Business Process: "${businessProcess}"
Goals: "${processGoals}"
Namespace: ${namespace}
${feedbackSection}
${webResearchSection}
Incorporate these best practices:
${bestPractices.map((practice) => `- ${practice}`).join("\n")}

Consider using these recommended tasks:
${recommendedTasks.map((task) => `- ${task}`).join("\n")}

Generate a complete, valid Kestra YAML flow that:
1. Has a descriptive ID in kebab-case
2. Uses the correct namespace: ${namespace}
3. Includes a clear description
4. Uses appropriate task types 
5. Is functional and follows Kestra syntax

IMPORTANT GUIDELINES:
- If you don't find information about a task type in Kestra docs, use web search to find examples instead of repeatedly calling the docs tool
- Don't call kestraDocsTool more than once for the same task type
- If kestraDocsTool doesn't return useful information, immediately try webSearchTool with "kestra yaml [task type] example" as query

Return just the YAML flow:
    `;

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
    });

    // Extract flow ID from the generated YAML
    const yamlText = result.text.trim();
    const idMatch = yamlText.match(/id:\s*([^\n]+)/);
    const flowId = idMatch?.[1]?.trim() || "generated-flow";

    return {
      flowYaml: yamlText,
      explanation: `Generated a Kestra flow based on your business process requirements`,
      flowId,
    };
  },
});

// Step 4: Get user approval
const approvalStep = createStep({
  id: "approval",
  description: "Get user approval for the generated flow",
  inputSchema: z.object({
    flowYaml: z.string(),
    explanation: z.string(),
    flowId: z.string(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    flowFeedback: z.string().optional(),
    flowYaml: z.string(),
    flowId: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    flowFeedback: z.string().optional(),
  }),
  suspendSchema: z.object({
    flowYaml: z.string(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (resumeData) {
      return {
        ...resumeData,
        flowYaml: inputData.flowYaml,
        flowId: inputData.flowId,
      };
    }

    await suspend({
      flowYaml: inputData.flowYaml,
      message:
        "Is this flow implementation satisfactory? If yes, type 'y'. If not, please provide specific feedback for improvements:",
    });

    return {
      approved: false,
      flowFeedback: "",
      flowYaml: inputData.flowYaml,
      flowId: inputData.flowId,
    };
  },
});

// Step 5: Provide guidance and next steps
const provideGuidanceStep = createStep({
  id: "provide-guidance",
  description: "Provide user guidance and Kestra UI links",
  inputSchema: z.object({
    approved: z.boolean(),
    flowYaml: z.string(),
    flowId: z.string(),
    namespace: z.string(),
    needsRefinement: z.boolean()
  }),
  outputSchema: z.object({
    message: z.string().describe("Complete guidance message"),
    yaml: z.string().describe("Generated YAML"),
    kestraUrl: z.string().describe("Kestra UI URL"),
    flowUrl: z.string().describe("Direct flow URL"),
  }),
  execute: async ({ inputData }) => {
    const { flowYaml, namespace, flowId, approved } = inputData;

    // Only show success message if approved
    const message = approved ?
      `Your Kestra flow has been successfully created!\n\nNext steps:\n1. Review the final YAML\n2. Test the flow in your Kestra instance\n3. Monitor execution and results\n\nYou can view and manage your flow in the Kestra UI.` :
      `The flow was not approved. Please try again with different requirements.`;

    return {
      message,
      yaml: flowYaml,
      kestraUrl: `http://localhost:8100/ui/flows?namespace=${namespace}`,
      flowUrl: `http://localhost:8100/ui/flows/${namespace}/${flowId}`,
    };
  },
});

// Create the flow generation workflow
const kestraFlowGeneration = createWorkflow({
  id: "kestra-flow-generation",
  inputSchema: z.object({
    namespace: z
      .string()
      .default("company.team")
      .describe("Kestra namespace to use"),
  }),
  outputSchema: z.object({
    message: z.string().describe("Complete guidance message"),
    yaml: z.string().describe("Generated YAML"),
    kestraUrl: z.string().describe("Kestra UI URL"),
    flowUrl: z.string().describe("Direct flow URL"),
  }),
  // Steps are defined in the chain below instead of here
});

// Define the flow execution as a linear sequence first, then use conditional branching for iteration
kestraFlowGeneration
  .then(getUserRequirementsStep)
  .then(researchSimilarFlowsStep)
  .then(generateYamlStep)
  .then(approvalStep)
  // Conditional loop - if not approved, go back to generate step with feedback
  // Use a simple then instead and handle conditionals inside a custom step
  .then(createStep({
    id: "conditional-routing",
    inputSchema: z.object({
      approved: z.boolean(),
      flowFeedback: z.string().optional(),
      flowYaml: z.string(),
      flowId: z.string(),
      businessProcess: z.string(),
      processGoals: z.string(),
      researchData: z.any(),
      bestPractices: z.array(z.string()),
      recommendedTasks: z.array(z.string()),
      namespace: z.string().default("company.team")
    }),
    outputSchema: z.object({
      // Same as input schema to pass through all values
      approved: z.boolean(),
      flowYaml: z.string(),
      flowId: z.string(),
      namespace: z.string(),
      needsRefinement: z.boolean()
    }),
    execute: async ({ inputData }) => {
      // If approved, continue to guidance, otherwise go back for refinement
      return {
        ...inputData,
        needsRefinement: !inputData.approved
      };
    }
  }))
  .then(provideGuidanceStep)
  .commit();

export { kestraFlowGeneration };
