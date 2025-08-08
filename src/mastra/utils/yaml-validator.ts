import * as yaml from "yaml";
import { z } from "zod";

/**
 * Interface for validation result with detailed diagnostics and fixes
 */
interface YamlValidationResult {
  isValid: boolean;
  parsedYaml?: any;
  errors: string[];
  fixedYaml?: string;
  fixesMade: string[];
}

/**
 * Schema for basic Kestra flow structure validation
 */
const kestraFlowSchema = z.object({
  id: z.string().min(1, "Flow ID must not be empty"),
  namespace: z.string().min(1, "Namespace must not be empty"),
  tasks: z.array(
    z.object({
      id: z.string().min(1, "Task ID must not be empty"),
      type: z.string().min(1, "Task type must not be empty"),
    }).passthrough()
  ).min(1, "At least one task is required"),
}).passthrough();

/**
 * Validates YAML for Kestra flow and attempts to fix common issues
 * 
 * @param yamlContent The YAML content to validate
 * @returns Validation result with diagnostics and fixes
 */
export function validateAndFixKestraYaml(yamlContent: string): YamlValidationResult {
  const result: YamlValidationResult = {
    isValid: false,
    errors: [],
    fixesMade: []
  };

  try {
    // Step 1: Check for basic YAML syntax
    try {
      result.parsedYaml = yaml.parse(yamlContent);
    } catch (yamlError: any) {
      result.errors.push(`YAML syntax error: ${yamlError.message}`);
      return result;
    }

    // Step 2: Check Kestra flow structure using schema
    const schemaResult = kestraFlowSchema.safeParse(result.parsedYaml);
    if (!schemaResult.success) {
      schemaResult.error.errors.forEach(err => {
        result.errors.push(`${err.path.join('.')}: ${err.message}`);
      });
    }

    // Step 3: Check for common Kestra-specific issues and apply fixes
    let yamlModified = false;
    const fixes = applyCommonFixes(result.parsedYaml);

    if (fixes.modified) {
      yamlModified = true;
      result.fixesMade.push(...fixes.fixesMade);
    }

    // Step 4: Re-validate after fixes
    if (yamlModified) {
      result.fixedYaml = yaml.stringify(result.parsedYaml);
      try {
        // Ensure the fixed YAML is still valid YAML syntax
        yaml.parse(result.fixedYaml);
      } catch (yamlError: any) {
        result.errors.push(`Error after applying fixes: ${yamlError.message}`);
        result.fixedYaml = undefined;
        return result;
      }
    }

    // If we have no errors or we've fixed all issues, mark as valid
    if (result.errors.length === 0 || yamlModified) {
      result.isValid = true;
    }

    return result;
  } catch (error: any) {
    result.errors.push(`Unexpected error during validation: ${error.message}`);
    return result;
  }
}

/**
 * Apply common fixes to Kestra YAML
 * 
 * @param yamlObject The parsed YAML object
 * @returns Object containing modification status and list of fixes made
 */
function applyCommonFixes(yamlObject: any): { modified: boolean; fixesMade: string[] } {
  const fixesMade: string[] = [];
  let modified = false;

  if (!yamlObject) {
    return { modified, fixesMade };
  }

  // Fix 1: Ensure namespace exists
  if (!yamlObject.namespace) {
    yamlObject.namespace = "company.team";
    fixesMade.push("Added missing namespace: 'company.team'");
    modified = true;
  }

  // Fix 2: Fix retry format - must be an object with type property, not an integer
  if (yamlObject.tasks && Array.isArray(yamlObject.tasks)) {
    for (let i = 0; i < yamlObject.tasks.length; i++) {
      const task = yamlObject.tasks[i];
      
      // Check if retry is a simple number and convert to proper format
      if (task.retry !== undefined && (typeof task.retry === 'number' || typeof task.retry === 'string')) {
        const maxAttempt = parseInt(String(task.retry), 10);
        yamlObject.tasks[i].retry = {
          type: "constant",
          maxAttempt: isNaN(maxAttempt) ? 1 : maxAttempt
        };
        fixesMade.push(`Fixed task '${task.id}': Converted simple retry value to proper object format`);
        modified = true;
      }
    }
  }

  // Fix 3: Ensure tasks array exists
  if (!yamlObject.tasks) {
    yamlObject.tasks = [];
    fixesMade.push("Added missing tasks array");
    modified = true;
  }

  // Fix 4: Convert non-array tasks to array
  if (yamlObject.tasks && !Array.isArray(yamlObject.tasks)) {
    // If tasks is an object, try to convert it to an array
    if (typeof yamlObject.tasks === 'object') {
      yamlObject.tasks = [yamlObject.tasks];
      fixesMade.push("Converted tasks object to array format");
      modified = true;
    }
  }

  // Fix 5: Ensure each task has an ID
  if (yamlObject.tasks && Array.isArray(yamlObject.tasks)) {
    for (let i = 0; i < yamlObject.tasks.length; i++) {
      const task = yamlObject.tasks[i];
      if (!task.id) {
        task.id = `task-${i + 1}`;
        fixesMade.push(`Added missing task ID: '${task.id}'`);
        modified = true;
      }
    }
  }

  // Fix 6: Check for invalid environment variables format
  if (yamlObject.tasks && Array.isArray(yamlObject.tasks)) {
    for (let i = 0; i < yamlObject.tasks.length; i++) {
      const task = yamlObject.tasks[i];
      
      // Convert string env to object format
      if (task.env && typeof task.env === 'string') {
        try {
          // Try to parse it as JSON if it looks like JSON
          if (task.env.trim().startsWith('{') && task.env.trim().endsWith('}')) {
            yamlObject.tasks[i].env = JSON.parse(task.env);
            fixesMade.push(`Fixed task '${task.id}': Converted env from string to object format`);
            modified = true;
          } else {
            // Otherwise convert to simple key=value
            yamlObject.tasks[i].env = { VALUE: task.env };
            fixesMade.push(`Fixed task '${task.id}': Converted env string to object with VALUE key`);
            modified = true;
          }
        } catch (e) {
          // If JSON parse fails, fall back to simple object
          yamlObject.tasks[i].env = { VALUE: task.env };
          fixesMade.push(`Fixed task '${task.id}': Converted env string to object with VALUE key`);
          modified = true;
        }
      }
    }
  }

  return { modified, fixesMade };
}

/**
 * Enhance YAML based on task type using Kestra documentation
 * This function would use kestraDocsTool to get proper syntax
 * Note: The actual implementation would call kestraDocsTool, but for this example
 * we're just defining the function structure
 */
export async function enhanceYamlWithKestraDocs(
  yamlContent: string,
  kestraDocsFunction: (query: string, taskType?: string) => Promise<any>
): Promise<YamlValidationResult> {
  const initialValidation = validateAndFixKestraYaml(yamlContent);
  
  // If basic validation totally failed, return early
  if (!initialValidation.parsedYaml) {
    return initialValidation;
  }

  const result: YamlValidationResult = {
    ...initialValidation,
    fixesMade: [...initialValidation.fixesMade]
  };

  // Start with the fixed YAML if available, otherwise use the original
  const yamlToEnhance = result.fixedYaml || yamlContent;
  let parsedYaml = result.parsedYaml;

  try {
    // Look up each task type in documentation
    if (parsedYaml.tasks && Array.isArray(parsedYaml.tasks)) {
      for (let i = 0; i < parsedYaml.tasks.length; i++) {
        const task = parsedYaml.tasks[i];
        
        if (!task.type) continue;
        
        // Query Kestra docs for this task type
        const taskType = task.type;
        const docsResult = await kestraDocsFunction("", taskType);
        
        if (docsResult && docsResult.examples && docsResult.examples.length > 0) {
          // Compare task properties with documentation examples
          const missingProperties = findMissingProperties(task, docsResult);
          
          if (missingProperties.length > 0) {
            // Apply missing required properties from example
            const fixResult = applyMissingProperties(task, docsResult, missingProperties);
            
            if (fixResult.modified) {
              parsedYaml.tasks[i] = fixResult.updatedTask;
              result.fixesMade.push(...fixResult.fixesMade);
            }
          }
        }
      }
    }
    
    // Regenerate the fixed YAML
    result.fixedYaml = yaml.stringify(parsedYaml);
    result.parsedYaml = parsedYaml;
    result.isValid = true;
    
    return result;
  } catch (error: any) {
    result.errors.push(`Error enhancing YAML with Kestra docs: ${error.message}`);
    return result;
  }
}

/**
 * Helper function to find missing properties based on docs examples
 * This is a placeholder that would be implemented with actual logic
 */
function findMissingProperties(task: any, docsResult: any): string[] {
  // This is a simplified implementation
  const missingProps: string[] = [];
  
  // Check required properties from documentation
  if (docsResult.taskProperties) {
    Object.keys(docsResult.taskProperties).forEach(prop => {
      if (task[prop] === undefined) {
        missingProps.push(prop);
      }
    });
  }
  
  return missingProps;
}

/**
 * Helper function to apply missing properties from docs examples
 * This is a placeholder that would be implemented with actual logic
 */
function applyMissingProperties(
  task: any,
  docsResult: any,
  missingProperties: string[]
): { modified: boolean; updatedTask: any; fixesMade: string[] } {
  const fixesMade: string[] = [];
  let modified = false;
  
  // This is a simplified implementation
  // Clone the task to avoid modifying the original
  const updatedTask = { ...task };
  
  missingProperties.forEach(prop => {
    if (docsResult.taskProperties && docsResult.taskProperties[prop]) {
      // Just a placeholder - in real implementation we'd extract default value from examples
      updatedTask[prop] = `<Value for ${prop}>`;
      fixesMade.push(`Added missing property '${prop}' to task '${task.id}'`);
      modified = true;
    }
  });
  
  return { modified, updatedTask, fixesMade };
}
