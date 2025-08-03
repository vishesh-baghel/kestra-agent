import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// Step 1: Generate YAML flow from user prompt
const generateYamlStep = createStep({
  id: "generate-yaml",
  description: "Generate Kestra YAML flow from natural language prompt",
  inputSchema: z.object({
    userPrompt: z
      .string()
      .describe("User's natural language description of the desired flow"),
    namespace: z
      .string()
      .default("company.team")
      .describe("Kestra namespace to use"),
  }),
  outputSchema: z.object({
    flowYaml: z.string().describe("Generated YAML flow"),
    explanation: z.string().describe("Explanation of the generated flow"),
    flowId: z.string().describe("Generated flow ID"),
  }),
  execute: async ({ inputData }) => {
    const { userPrompt, namespace } = inputData;

    const prompt = `
Create a simple Kestra workflow YAML based on this request:

User Request: "${userPrompt}"
Namespace: ${namespace}

Generate a complete, valid Kestra YAML workflow that:
1. Has a descriptive ID (use kebab-case)
2. Uses the correct namespace: ${namespace}
3. Includes a clear description
4. Uses simple task types like Log, HTTP Request, or Shell Commands
5. Is functional and follows Kestra syntax

Return just the YAML workflow:
    `;

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
    });

    // Extract flow ID from the generated YAML (simple approach)
    const yamlText = result.text.trim();
    const idMatch = yamlText.match(/id:\s*([^\n]+)/);
    const flowId = idMatch?.[1]?.trim() || "generated-flow";

    return {
      flowYaml: yamlText,
      explanation: `Generated a Kestra flow based on your request: "${userPrompt}"`,
      flowId,
    };
  },
});

// Step 2: Provide guidance and next steps
const provideGuidanceStep = createStep({
  id: "provide-guidance",
  description: "Provide user guidance and Kestra UI links",
  inputSchema: z.object({
    flowYaml: z.string(),
    explanation: z.string(),
    namespace: z.string(),
    flowId: z.string(),
  }),
  outputSchema: z.object({
    message: z.string().describe("Complete guidance message"),
    yaml: z.string().describe("Generated YAML"),
    kestraUrl: z.string().describe("Kestra UI URL"),
    flowUrl: z.string().describe("Direct flow URL"),
  }),
  execute: async ({ inputData }) => {
    const { flowYaml, explanation, namespace, flowId } = inputData;

    return {
      message: `${explanation}\n\nNext steps:\n1. Review the generated YAML\n2. Test it in your Kestra instance\n3. Modify as needed for your specific use case\n\nYou can view and manage workflows in the Kestra UI.`,
      yaml: flowYaml,
      kestraUrl: `http://localhost:8100/ui/flows?namespace=${namespace}`,
      flowUrl: `http://localhost:8100/ui/flows/${namespace}/${flowId}`,
    };
  },
});

// Create the workflow
const kestraWorkflowGeneration = createWorkflow({
  id: "kestra-workflow-generation",
  inputSchema: z.object({
    userPrompt: z
      .string()
      .describe("User's natural language description of the desired workflow"),
    namespace: z
      .string()
      .default("company.team")
      .describe("Kestra namespace to use"),
  }),
  outputSchema: z.object({
    message: z.string().describe("Complete guidance message"),
    yaml: z.string().describe("Generated YAML"),
    kestraUrl: z.string().describe("Kestra UI URL"),
    workflowUrl: z.string().describe("Direct workflow URL"),
  }),
})
  .then(generateYamlStep)
  .then(provideGuidanceStep);

kestraWorkflowGeneration.commit();

export { kestraWorkflowGeneration };
