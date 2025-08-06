import { RuntimeContext } from "@mastra/core/runtime-context";
import { FLOW_CONTEXT_KEYS } from "../context/flow-constants";

/**
 * Regular expression to match YAML code blocks in markdown
 */
const YAML_REGEX = /```(?:yaml|yml)\s*([\s\S]*?)```/i;

/**
 * Extract YAML content from text and store it in runtime context
 * 
 * @param text Text that may contain YAML content in code blocks
 * @param runtimeContext The RuntimeContext to store the YAML in
 * @returns true if YAML was found and stored, false otherwise
 */
export function extractAndStoreYaml(text: string, runtimeContext: RuntimeContext): boolean {
  try {
    // Try to extract YAML from markdown code blocks first
    const yamlMatch = text.match(YAML_REGEX);
    
    if (yamlMatch && yamlMatch[1]) {
      const yamlContent = yamlMatch[1].trim();
      
      // Store the YAML in the runtime context
      console.log("✅ Extracted YAML content from code block and storing in runtime context");
      runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_YAML, yamlContent);
      return true;
    }
    
    // If no code blocks, check if the text itself might be YAML
    if (text.trim().startsWith('id:') || text.includes('\nid:')) {
      console.log("✅ Text appears to be direct YAML content");
      runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_YAML, text.trim());
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("❌ Error extracting YAML:", error);
    return false;
  }
}

/**
 * Retrieve stored YAML from runtime context
 * 
 * @param runtimeContext The RuntimeContext to retrieve the YAML from
 * @returns The stored YAML content or undefined if not found
 */
export function getStoredYaml(runtimeContext: RuntimeContext): string | undefined {
  return runtimeContext.get(FLOW_CONTEXT_KEYS.FLOW_YAML);
}

/**
 * Store user execution preference in runtime context
 * 
 * @param preference User's preference ('auto' or 'manual')
 * @param runtimeContext The RuntimeContext to store the preference in
 */
export function storeUserExecutionPreference(
  preference: 'auto' | 'manual',
  runtimeContext: RuntimeContext
): void {
  runtimeContext.set(FLOW_CONTEXT_KEYS.USER_EXECUTION_PREFERENCE, preference);
}

/**
 * Get user execution preference from runtime context
 * 
 * @param runtimeContext The RuntimeContext to retrieve the preference from
 * @returns The stored preference or undefined if not found
 */
export function getUserExecutionPreference(
  runtimeContext: RuntimeContext
): 'auto' | 'manual' | undefined {
  return runtimeContext.get(FLOW_CONTEXT_KEYS.USER_EXECUTION_PREFERENCE);
}
