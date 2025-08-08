import {
  validateAndFixKestraYaml,
  enhanceYamlWithKestraDocs,
} from "./yaml-validator";
import { getStoredYaml } from "./yaml-interceptor";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { FLOW_CONTEXT_KEYS } from "../context/flow-constants";

/**
 * Interface for YAML validation and fixing result
 */
export interface YamlFixResult {
  originalYaml: string;
  fixedYaml?: string;
  isValid: boolean;
  errors: string[];
  fixesMade: string[];
  message: string;
}

/**
 * Validate and fix YAML from context or direct input, using kestraDocsTool for reference
 *
 * @param runtimeContext RuntimeContext containing YAML from design agent
 * @param directYaml Direct YAML input if not using runtime context
 * @param kestraDocsFunction The kestraDocsTool function for looking up correct syntax
 * @returns YamlFixResult containing validation status and fixed YAML if applicable
 */
export async function validateAndFixFlowYaml(
  runtimeContext?: RuntimeContext,
  directYaml?: string,
  kestraDocsFunction?: (query: string, taskType?: string) => Promise<any>
): Promise<YamlFixResult> {
  console.log("Starting YAML validation and fixing process...");
  
  // Step 1: Get the YAML from context or direct input
  let yamlContent = directYaml;
  if (!yamlContent && runtimeContext) {
    try {
      yamlContent = getStoredYaml(runtimeContext);
      if (yamlContent) {
        console.log("📄 Retrieved YAML flow definition from runtime context");
      } else {
        console.log("⚠️ No YAML found in runtime context");
      }
    } catch (error) {
      console.error("❌ Error retrieving YAML from runtime context:", error);
    }
  }

  // If we don't have YAML content, return error
  if (!yamlContent) {
    return {
      originalYaml: "",
      isValid: false,
      errors: ["No YAML content found in context or provided directly"],
      fixesMade: [],
      message: "No YAML content found to validate",
    };
  }

  console.log(
    `YAML content found (${yamlContent.length} characters). Starting validation...`
  );

  // Step 2: Perform basic validation and fixes
  const basicValidation = validateAndFixKestraYaml(yamlContent);

  // Step 3: If kestraDocsFunction is provided, enhance with Kestra docs
  let finalValidation = basicValidation;

  if (kestraDocsFunction && !basicValidation.isValid) {
    console.log(
      "Basic validation found issues. Enhancing with Kestra documentation..."
    );
    try {
      finalValidation = await enhanceYamlWithKestraDocs(
        yamlContent,
        kestraDocsFunction
      );
    } catch (error: any) {
      console.error("Error enhancing with Kestra docs:", error);
      // Fall back to basic validation if enhancement fails
      finalValidation = basicValidation;
      finalValidation.errors.push(`Docs enhancement failed: ${error.message}`);
    }
  }

  // Step 4: Update runtime context with fixed YAML if applicable
  if (finalValidation.isValid && finalValidation.fixedYaml && runtimeContext) {
    try {
      console.log("Updating runtime context with fixed YAML");
      runtimeContext.set(
        FLOW_CONTEXT_KEYS.FLOW_YAML,
        finalValidation.fixedYaml
      );
    } catch (error: any) {
      console.warn("Failed to update runtime context with fixed YAML:", error);
    }
  }

  // Step 5: Prepare result with helpful message
  const result: YamlFixResult = {
    originalYaml: yamlContent,
    fixedYaml: finalValidation.fixedYaml,
    isValid: finalValidation.isValid,
    errors: finalValidation.errors,
    fixesMade: finalValidation.fixesMade,
    message: "",
  };

  // Generate appropriate message
  if (!finalValidation.isValid) {
    result.message = `YAML validation failed with ${finalValidation.errors.length} errors. Please check the syntax.`;
  } else if (finalValidation.fixesMade.length > 0) {
    result.message = `YAML validated and fixed with ${finalValidation.fixesMade.length} automatic corrections.`;
  } else {
    result.message = "YAML is valid. No corrections needed.";
  }

  console.log(
    `YAML validation complete. ${result.isValid ? "Valid" : "Invalid"} with ${result.fixesMade.length} fixes made.`
  );
  return result;
}

/**
 * Extract task types from YAML to query Kestra documentation
 *
 * @param yamlContent YAML content to analyze
 * @returns Array of unique task types found in the YAML
 */
export function extractTaskTypes(yamlContent: string): string[] {
  try {
    const yaml = require("yaml");
    const parsed = yaml.parse(yamlContent);

    if (!parsed || !parsed.tasks || !Array.isArray(parsed.tasks)) {
      return [];
    }

    const taskTypes = parsed.tasks
      .map((task: any) => task.type)
      .filter((type: string | undefined): type is string => !!type);

    // Return unique task types
    return [...new Set(taskTypes)] as string[];
  } catch (error) {
    console.error("Error extracting task types:", error);
    return [];
  }
}
