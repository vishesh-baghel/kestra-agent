import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { kestraFlowDesignAgent, kestraFlowExecutionAgent } from "../agents";

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
  description: "Research similar business flows to improve quality using the specialized design agent",
  inputSchema: z.object({
    businessProcess: z.string(),
    processGoals: z.string(),
    namespace: z.string().default("company.team")
  }),
  outputSchema: z.object({
    researchData: z.any(),
    bestPractices: z.array(z.string()),
    recommendedTasks: z.array(z.string())
  }),
  execute: async ({ inputData }) => {
    try {
      // Use the specialized design agent for research
      console.log("Using kestraFlowDesignAgent for flow research");
      
      const researchPrompt = `Research best practices for implementing this business process as a Kestra flow:\n\n"${inputData.businessProcess}"\n\nWith these goals: "${inputData.processGoals}"\n\nIdentify:\n1. Similar workflow patterns\n2. Recommended Kestra tasks\n3. Best practices for implementation\n4. Common pitfalls to avoid\n\nReturn findings in structured format.`;

      const result = await kestraFlowDesignAgent.generate(
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
        bestPractices: resultObject.bestPractices || [],
        recommendedTasks: resultObject.recommendedTasks || []
      };
    } catch (error: any) {
      console.log({ error });
      return {
        researchData: { error: error.message },
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
    const { businessProcess, processGoals, namespace, bestPractices, recommendedTasks, flowFeedback } = inputData;

    // Include feedback for improvement if it exists
    const feedbackSection = flowFeedback
      ? `\nPrevious feedback to incorporate:\n${flowFeedback}\n`
      : "";

    const prompt = `
Create a Kestra flow YAML based on this business process:

Business Process: "${businessProcess}"
Goals: "${processGoals}"
Namespace: ${namespace}
${feedbackSection}
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

DELIVERY INSTRUCTIONS:
1. After presenting the YAML flow, ALWAYS include this EXACT message:
   "I've created the YAML flow definition. Would you like me to automatically create and test this flow in Kestra, or would you prefer to implement it yourself using the generated YAML?"
2. Then wait for the user's explicit response before proceeding

Return the complete YAML flow followed by the user prompt:
    `;

    // Use the specialized design agent to generate the flow YAML
    const result = await kestraFlowDesignAgent.generate(
      [
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        experimental_output: z.object({
          flowYaml: z.string().describe("Generated YAML flow"),
        }),
      }
    );

    // Extract flow ID from the generated YAML
    const yamlText = result.object?.flowYaml || "id: generated-flow";
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
  description:
    "Provide user guidance and Kestra UI links and attempt to create the flow in Kestra",
  inputSchema: z.object({
    approved: z.boolean(),
    flowYaml: z.string(),
    flowId: z.string(),
    namespace: z.string(),
    needsRefinement: z.boolean(),
  }),
  outputSchema: z.object({
    message: z.string().describe("Complete guidance message"),
    yaml: z.string().describe("Generated YAML"),
    kestraUrl: z.string().describe("Kestra UI URL"),
    flowUrl: z.string().describe("Direct flow URL"),
    executionUrl: z
      .string()
      .optional()
      .describe("URL for flow execution if created"),
  }),
  execute: async ({ inputData, mastra }) => {
    const { flowYaml, namespace, flowId, approved } = inputData;
    let flowUrl = `http://localhost:8100/ui/flows/${namespace}/${flowId}`;
    let executionUrl = "";
    let message = "";

    // Only attempt to create and execute flow if approved
    if (approved) {
      try {
        // Use the execution agent to create the flow in Kestra
        const createResult = await kestraFlowExecutionAgent.generate(
          [
            {
              role: "user",
              content: `Please create a new Kestra flow with the following YAML and name it "${flowId}":\n\n${flowYaml}`,
            },
          ],
          {
            experimental_output: z.object({
              flowUrl: z.string().optional(),
              executionUrl: z.string().optional(),
              success: z.boolean(),
            }),
          }
        );

        // If flow was created successfully, update URLs and message
        if (createResult.object?.success) {
          flowUrl = createResult.object?.flowUrl || flowUrl;
          executionUrl = createResult.object?.executionUrl || "";
          message = `✅ Your Kestra flow has been successfully created and executed!\n\nNext steps:\n1. Review the final YAML\n2. Monitor execution results\n3. Make any necessary adjustments\n\nYou can view and manage your flow in the Kestra UI.`;
        } else {
          message = `✅ Your Kestra flow has been designed, but there was an issue creating it in Kestra.\n\nNext steps:\n1. Review the final YAML\n2. Try creating the flow manually in Kestra UI\n3. Check for syntax errors\n\nYou can access Kestra UI to create your flow.`;
        }
      } catch (error) {
        console.error("Error creating flow:", error);
        message = `✅ Your Kestra flow has been designed, but there was an error creating it in Kestra.\n\nNext steps:\n1. Review the final YAML\n2. Try creating the flow manually in Kestra UI\n3. Check for syntax errors\n\nYou can access Kestra UI to create your flow.`;
      }
    } else {
      message = `The flow was not approved. Please try again with different requirements.`;
    }

    return {
      message,
      yaml: flowYaml,
      kestraUrl: `http://localhost:8100/ui/flows?namespace=${namespace}`,
      flowUrl,
      executionUrl,
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
    executionUrl: z
      .string()
      .optional()
      .describe("URL for flow execution if created"),
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
  .then(
    createStep({
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
        namespace: z.string().default("company.team"),
      }),
      outputSchema: z.object({
        // Same as input schema to pass through all values
        approved: z.boolean(),
        flowYaml: z.string(),
        flowId: z.string(),
        namespace: z.string(),
        needsRefinement: z.boolean(),
      }),
      execute: async ({ inputData }) => {
        // If approved, continue to guidance, otherwise go back for refinement
        return {
          ...inputData,
          needsRefinement: !inputData.approved,
        };
      },
    })
  )
  .then(provideGuidanceStep)
  .commit();

export { kestraFlowGeneration };
