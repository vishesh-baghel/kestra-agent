import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { validateAndFixFlowYaml, YamlFixResult } from "../utils/flow-yaml-fixer";
import { RuntimeContext } from "@mastra/core/runtime-context";

/**
 * Tool to validate and fix YAML flow definitions using Kestra documentation
 * This tool allows the agent to check and correct YAML syntax issues before creating flows
 */
export const validateYamlTool = createTool({
  id: "validate-yaml-tool",
  description: `Validates and fixes YAML flow definitions by checking against Kestra requirements and documentation. 
  This tool can automatically correct common errors in YAML syntax and structure, ensuring that flows can be successfully created in Kestra.`,
  inputSchema: z.object({
    flowYaml: z
      .string()
      .optional()
      .describe("The YAML flow definition to validate (optional if using context)"),
    useContext: z
      .boolean()
      .default(true)
      .describe("Whether to use YAML from context instead of direct input"),
  }),
  outputSchema: z.object({
    isValid: z.boolean().describe("Whether the YAML is valid or was fixed successfully"),
    originalYaml: z.string().describe("The original YAML before validation"),
    fixedYaml: z.string().optional().describe("The fixed YAML if corrections were made"),
    errors: z.array(z.string()).describe("Validation errors found"),
    fixesMade: z.array(z.string()).describe("List of fixes that were applied"),
    message: z.string().describe("Summary of validation results"),
  }),
  execute: async (params: any, options: any) => {
    console.log("[VALIDATE-YAML-TOOL] Starting execution with params:", params);
    
    // Extract parameters, handling both direct and nested context structure like create-flow-tool
    const contextParams = params.context || params;
    const flowYaml = contextParams.flowYaml;
    const useContext = contextParams.useContext !== false; // Default to true if not specified
    
    console.log(`[VALIDATE-YAML-TOOL] Parameters extracted: flowYaml length=${flowYaml ? flowYaml.length : 0}, useContext=${useContext}`);
    
    // Get runtime context and tools
    const runtimeContext = options?.runtimeContext;
    const kestraDocsFunction = options?.tools?.kestraDocsTool?.execute;
    
    console.log(`[VALIDATE-YAML-TOOL] Runtime context available: ${!!runtimeContext}, kestraDocsTool available: ${!!kestraDocsFunction}`);
    
    try {
      let result: YamlFixResult;
      
      // Use either direct YAML or retrieve from context
      if (useContext) {
        console.log("[VALIDATE-YAML-TOOL] Using YAML from runtime context");
        result = await validateAndFixFlowYaml(
          runtimeContext,
          flowYaml, // Also pass flowYaml as fallback
          kestraDocsFunction
        );
      } else {
        console.log("[VALIDATE-YAML-TOOL] Using directly provided YAML");
        if (!flowYaml) {
          return {
            isValid: false,
            originalYaml: "",
            errors: ["No YAML provided for direct validation"],
            fixesMade: [],
            message: "YAML validation failed: No YAML content provided"
          };
        }
        
        result = await validateAndFixFlowYaml(
          undefined,
          flowYaml,
          kestraDocsFunction
        );
      }
      
      return {
        isValid: result.isValid,
        originalYaml: result.originalYaml,
        fixedYaml: result.fixedYaml,
        errors: result.errors,
        fixesMade: result.fixesMade,
        message: result.message
      };
    } catch (error: any) {
      console.error("[VALIDATE-YAML-TOOL] Error:", error);
      return {
        isValid: false,
        originalYaml: flowYaml || "",
        errors: [`Unexpected error: ${error.message}`],
        fixesMade: [],
        message: `YAML validation failed with error: ${error.message}`
      };
    }
  }
});
