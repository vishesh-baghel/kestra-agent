import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as yaml from "yaml";
import { getStoredYaml } from "../utils/yaml-interceptor";
import { FLOW_CONTEXT_KEYS } from "../context/flow-constants";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { getFlowContext, KestraFlowContext } from "../context/flow-context";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Generate a random flow ID with timestamp and random suffix
 */
function generateRandomFlowId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `flow_${timestamp}_${randomSuffix}`;
}

/**
 * Tool to create a new Kestra flow from YAML definition
 * This tool should be used only once at the start of a conversation to create a new flow
 * Now automatically generates unique flow IDs without requiring user input
 */
export const createFlowTool = createTool({
  id: "create-flow-tool",
  description: `Creates a new Kestra flow from YAML definition with an automatically generated unique ID. This tool validates the YAML syntax and creates the flow in Kestra. Use this tool only once at the start of a conversation to create a new flow. For modifications, use the edit-flow-tool instead.`,
  inputSchema: z.object({
    flowYaml: z
      .string()
      .describe("The complete YAML flow definition to create")
      .optional(),
    namespace: z
      .string()
      .default("company.team")
      .describe("Kestra namespace for the flow"),
    flowId: z
      .string()
      .optional()
      .describe("Optional specific flow ID (auto-generated if not provided)"),
    flowPurpose: z
      .string()
      .optional()
      .describe(
        "Brief description of flow purpose to use in the auto-generated ID"
      ),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the flow was successfully created"),
    flowId: z.string().optional().describe("The flow ID that was created"),
    namespace: z.string().describe("The namespace used"),
    status: z
      .string()
      .describe("Creation status (CREATED, VALIDATION_FAILED, etc.)"),
    errors: z
      .array(z.string())
      .describe("Any errors encountered during creation"),
    validationErrors: z.array(z.string()).describe("YAML validation errors"),
    flowUrl: z
      .string()
      .optional()
      .describe("URL to view the flow in Kestra UI"),
  }),
  execute: async (params: any, ctx?: any) => {
    console.log("[CREATE-FLOW-TOOL] Starting execution with params:", params);

    // Extract parameters, handling both direct and nested context structure
    const contextParams = params.context || params;
    const inputFlowYaml = contextParams.flowYaml;
    const namespace = contextParams.namespace;
    const flowId = contextParams.flowId;
    const flowPurpose = contextParams.flowPurpose;
    // Get the shared KestraFlowContext singleton
    const flowContext = getFlowContext();
    // Get the actual RuntimeContext from the tool execution context
    const runtimeContext = ctx?.runtimeContext as RuntimeContext | undefined;
    // First check RuntimeContext for flow YAML data
    let yamlContent: string | undefined;
    
    // Check the actual RuntimeContext first if available
    if (runtimeContext) {
      try {
        yamlContent = getStoredYaml(runtimeContext);
        if (yamlContent) {
          console.log("📄 Using YAML flow definition from RuntimeContext");
        }
      } catch (error) {
        console.error("❌ Error retrieving YAML from RuntimeContext:", error);
      }
    } else {
      console.log("RuntimeContext not available in tool context");
    }
    
    console.log("KestraFlowContext YAML:", flowContext.getFlowYaml() ? "available" : "not available");
    // Second, check KestraFlowContext if not found in RuntimeContext
    if (!yamlContent) {
      try {
        yamlContent = flowContext.getFlowYaml();
        if (yamlContent) {
          console.log("📄 Using YAML flow definition from KestraFlowContext");

          // If found in KestraFlowContext and we have RuntimeContext, copy it there for future use
          if (runtimeContext) {
            runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_YAML, yamlContent);
            console.log(
              "📄 Copied YAML from KestraFlowContext to RuntimeContext"
            );
          }
        }
      } catch (error) {
        console.error(
          "❌ Error retrieving YAML from KestraFlowContext:",
          error
        );
      }
    }

    // Finally, if not found in either context, use the input parameters
    if (!yamlContent && inputFlowYaml) {
      yamlContent = inputFlowYaml;
      console.log("📄 Using YAML flow definition from direct input parameters");
      
      // When using direct input, we should store it in both contexts for future reference
      // This ensures consistency even if the tool is called with direct parameters
      try {
        // Store in KestraFlowContext (yamlContent must be defined here since we're in the if block)
        if (yamlContent) {
          flowContext.setFlowYaml(yamlContent);
          console.log("📄 Copied direct input YAML to KestraFlowContext for consistency");
        }
        
        // Store in RuntimeContext if available
        if (runtimeContext) {
          runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_YAML, yamlContent);
          console.log("📄 Copied direct input YAML to RuntimeContext for consistency");
        }
      } catch (error) {
        console.error("❌ Error storing direct input YAML to contexts:", error);
      }
    }

    // Store the flowId and namespace in runtime context if available
    if (runtimeContext) {
      if (flowId) {
        runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_ID, flowId);
      }
      if (namespace) {
        runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_NAMESPACE, namespace);
      }
      console.log("Stored flow ID and namespace in runtime context");
    }
    
    // Comprehensive diagnostic logging to trace where YAML came from
    console.log("=== CREATE FLOW TOOL YAML SOURCE DIAGNOSTICS ===");
    console.log("YAML from direct input:", inputFlowYaml ? `${inputFlowYaml.length} chars` : "not provided");
    
    // Safely check RuntimeContext
    const runtimeContextYaml = runtimeContext ? getStoredYaml(runtimeContext) : undefined;
    console.log("YAML from RuntimeContext:", runtimeContextYaml ? "available" : "not available");
    
    // Check KestraFlowContext
    const kestraContextYaml = flowContext.getFlowYaml();
    console.log("YAML from KestraFlowContext:", kestraContextYaml ? "available" : "not available");
    
    // Determine the source of the final YAML content
    let yamlSource = "unknown";
    if (yamlContent === inputFlowYaml && inputFlowYaml) yamlSource = "direct input";
    else if (runtimeContextYaml && yamlContent === runtimeContextYaml) yamlSource = "RuntimeContext";
    else if (kestraContextYaml && yamlContent === kestraContextYaml) yamlSource = "KestraFlowContext";
    
    console.log("Final YAML source:", yamlSource);
    console.log("Final YAML length:", yamlContent ? yamlContent.length : 0);
    console.log("=== END DIAGNOSTICS ===");

    // If we still don't have YAML, return an error
    if (!yamlContent) {
      console.log(
        "No flow YAML provided or found in context. Please provide flow YAML to create a flow."
      );
      return {
        status: "error",
        namespace: namespace || "default",
        success: false,
        message:
          "No flow YAML provided or found in context. Please provide flow YAML to create a flow.",
        errors: ["No flow YAML provided"],
        validationErrors: [],
        flowId: undefined,
        flowUrl: undefined,
      };
    }

    // Use the YAML we've found (either from input or runtime context)
    const flowYaml = yamlContent;

    console.log(`[CREATE-FLOW-TOOL] Starting execution with params:`);
    console.log(`[CREATE-FLOW-TOOL] - namespace: ${namespace}`);
    console.log(
      `[CREATE-FLOW-TOOL] - flowId: ${flowId || "<will be auto-generated>"}`
    );
    console.log(
      `[CREATE-FLOW-TOOL] - flowPurpose: ${flowPurpose || "<not specified>"}`
    );
    console.log(
      `[CREATE-FLOW-TOOL] - flowYaml source: ${runtimeContext ? "runtime context" : "direct input"}`
    );
    console.log(
      `[CREATE-FLOW-TOOL] - flowYaml length: ${flowYaml ? flowYaml.length : 0} characters`
    );

    const errors: string[] = [];
    const validationErrors: string[] = [];

    try {
      // Step 1: Validate YAML syntax
      console.log(`[CREATE-FLOW-TOOL] Starting YAML validation`);
      let parsedYaml: any;
      try {
        parsedYaml = yaml.parse(flowYaml);
        console.log(`[CREATE-FLOW-TOOL] YAML parsed successfully`);
      } catch (yamlError: any) {
        console.log(
          `[CREATE-FLOW-TOOL] YAML parsing failed: ${yamlError.message}`
        );
        validationErrors.push(`YAML syntax error: ${yamlError.message}`);
        return {
          success: false,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      // Step 2: Validate Kestra flow structure
      console.log(`[CREATE-FLOW-TOOL] Validating Kestra flow structure`);

      if (!parsedYaml.id) {
        console.log(`[CREATE-FLOW-TOOL] Validation error: Missing 'id' field`);
        validationErrors.push("Flow must have an 'id' field");
      } else {
        console.log(`[CREATE-FLOW-TOOL] Flow ID from YAML: ${parsedYaml.id}`);
      }

      // Check for namespace or defaultNamespace field
      if (!parsedYaml.namespace && !parsedYaml.defaultNamespace) {
        console.log(
          `[CREATE-FLOW-TOOL] Validation error: Missing 'namespace' field`
        );
        validationErrors.push("Flow must have a 'namespace' field");
      } else {
        // If defaultNamespace exists but namespace doesn't, use defaultNamespace
        if (parsedYaml.defaultNamespace && !parsedYaml.namespace) {
          console.log(
            `[CREATE-FLOW-TOOL] Found 'defaultNamespace' instead of 'namespace', will convert during processing`
          );
          parsedYaml.namespace = parsedYaml.defaultNamespace;
        }
        console.log(
          `[CREATE-FLOW-TOOL] Namespace from YAML: ${parsedYaml.namespace}`
        );
      }

      if (
        !parsedYaml.tasks ||
        !Array.isArray(parsedYaml.tasks) ||
        parsedYaml.tasks.length === 0
      ) {
        console.log(
          `[CREATE-FLOW-TOOL] Validation error: Missing or empty 'tasks' array`
        );
        validationErrors.push(
          "Flow must have at least one task in the 'tasks' array"
        );
      } else {
        console.log(
          `[CREATE-FLOW-TOOL] Tasks found in YAML: ${parsedYaml.tasks.length} tasks`
        );
      }

      if (validationErrors.length > 0) {
        console.log(
          `[CREATE-FLOW-TOOL] Validation failed with ${validationErrors.length} errors`
        );
        return {
          success: false,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      console.log(`[CREATE-FLOW-TOOL] Flow structure validation successful`);

      // Generate a descriptive, unique flow ID
      console.log(`[CREATE-FLOW-TOOL] Generating unique flow ID...`);
      let finalFlowId;

      if (flowId) {
        // Use provided ID if explicitly given
        finalFlowId = flowId;
        console.log(
          `[CREATE-FLOW-TOOL] Using explicitly provided flowId: ${finalFlowId}`
        );
      } else {
        // Generate descriptive ID based on purpose or parsed ID
        const baseId = flowPurpose
          ? flowPurpose
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "")
          : parsedYaml.id || "flow";

        // Add unique timestamp and random suffix
        const timestamp = Date.now().toString(36);
        const randomSuffix = Math.random().toString(36).substring(2, 5);
        finalFlowId = `${baseId}_${timestamp}_${randomSuffix}`;

        console.log(
          `[CREATE-FLOW-TOOL] Generated unique descriptive flowId: ${finalFlowId}`
        );
      }

      const finalNamespace = parsedYaml.namespace || namespace;
      console.log(`[CREATE-FLOW-TOOL] Using namespace: ${finalNamespace}`);

      // Update the YAML with the final flowId and namespace
      let updatedYaml = flowYaml.replace(/^id:\s*.*$/m, `id: ${finalFlowId}`);

      // Ensure namespace is set correctly and handle defaultNamespace if present
      if (updatedYaml.includes("namespace:")) {
        updatedYaml = updatedYaml.replace(
          /^namespace:\s*.*$/m,
          `namespace: ${finalNamespace}`
        );
      } else if (updatedYaml.includes("defaultNamespace:")) {
        // Replace defaultNamespace with namespace
        updatedYaml = updatedYaml.replace(
          /^defaultNamespace:\s*.*$/m,
          `namespace: ${finalNamespace}`
        );
      } else {
        // Add namespace if neither exists
        updatedYaml = `namespace: ${finalNamespace}\n${updatedYaml}`;
      }

      // If defaultNamespace still exists after the above changes, remove it
      if (updatedYaml.includes("defaultNamespace:")) {
        updatedYaml = updatedYaml.replace(
          /^defaultNamespace:\s*.*$(\r?\n)?/m,
          ""
        );
      }

      console.log(
        `[CREATE-FLOW-TOOL] Updated YAML with flowId: ${finalFlowId} and namespace: ${finalNamespace}`
      );
      console.log(
        `[CREATE-FLOW-TOOL] YAML content to be sent: \n${updatedYaml}`
      );

      // Validate the updated YAML
      try {
        const updatedParsedYaml = yaml.parse(updatedYaml);
        console.log(`[CREATE-FLOW-TOOL] Updated YAML parsed successfully`);
      } catch (yamlError: any) {
        console.log(
          `[CREATE-FLOW-TOOL] Updated YAML parsing failed: ${yamlError.message}`
        );
        validationErrors.push(
          `Updated YAML syntax error: ${yamlError.message}`
        );
        return {
          success: false,
          namespace: finalNamespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }

      // Step 3: Create flow in Kestra with retry logic for ID conflicts
      console.log(`[CREATE-FLOW-TOOL] Preparing to create flow in Kestra`);
      const attemptCreateFlow = async (
        yamlContent: string,
        attemptFlowId: string
      ): Promise<any> => {
        console.log(
          `[CREATE-FLOW-TOOL] Attempting to create flow with ID: ${attemptFlowId}`
        );
        try {
          // Print out the exact content being sent for debugging the 422 error
          console.log(
            `[CREATE-FLOW-TOOL] YAML content being submitted:\n${yamlContent}`
          );

          console.log(
            `[CREATE-FLOW-TOOL] Making API request to ${KESTRA_BASE_URL}/api/v1/flows`
          );

          // First attempt to validate the YAML structure and fix common issues
          try {
            let validateYaml = yaml.parse(yamlContent);
            console.log(
              `[CREATE-FLOW-TOOL] YAML validation before sending: Valid`
            );

            // Check for required fields per Kestra documentation
            if (!validateYaml.id) {
              throw new Error("Missing required 'id' field in flow YAML");
            }
            if (!validateYaml.namespace) {
              throw new Error(
                "Missing required 'namespace' field in flow YAML"
              );
            }
            if (
              !validateYaml.tasks ||
              !Array.isArray(validateYaml.tasks) ||
              validateYaml.tasks.length === 0
            ) {
              throw new Error(
                "Flow must have at least one task in the 'tasks' array"
              );
            }

            // Fix common issues based on known Kestra requirements
            let yamlModified = false;

            // Fix retry format - must be an object with type property, not an integer
            if (validateYaml.tasks) {
              for (let i = 0; i < validateYaml.tasks.length; i++) {
                const task = validateYaml.tasks[i];

                // Check if retry is a simple number and convert to proper format
                if (
                  task.retry !== undefined &&
                  (typeof task.retry === "number" ||
                    typeof task.retry === "string")
                ) {
                  const maxAttempt = parseInt(task.retry);
                  console.log(
                    `[CREATE-FLOW-TOOL] Converting simple retry value ${task.retry} to proper format for task ${task.id}`
                  );
                  validateYaml.tasks[i].retry = {
                    type: "constant",
                    maxAttempt: maxAttempt,
                  };
                  yamlModified = true;
                }
              }
            }

            // If we made modifications, regenerate the YAML
            if (yamlModified) {
              yamlContent = yaml.stringify(validateYaml);
              console.log(
                `[CREATE-FLOW-TOOL] Modified YAML to fix common issues: \n${yamlContent}`
              );
            }
          } catch (validationError: any) {
            console.log(
              `[CREATE-FLOW-TOOL] YAML validation error: ${validationError.message}`
            );
            // Continue anyway - let the server provide the specific validation error
          }

          const createResponse = await axios.post(
            `${KESTRA_BASE_URL}/api/v1/flows`,
            yamlContent,
            {
              headers: {
                "Content-Type": "application/x-yaml",
              },
            }
          );
          console.log(
            `[CREATE-FLOW-TOOL] Flow creation successful! Status: ${createResponse.status}`
          );
          return {
            success: true,
            response: createResponse,
          };
        } catch (error: any) {
          if (error.response?.status === 409) {
            // Flow ID conflict
            console.log(
              `[CREATE-FLOW-TOOL] Flow ID conflict: '${attemptFlowId}' already exists`
            );
            return {
              success: false,
              conflict: true,
              error: `Flow ID '${attemptFlowId}' already exists`,
            };
          } else if (error.response?.status === 422) {
            // Validation error - log the detailed error message
            const errorDetails = error.response?.data || {};
            console.log(
              `[CREATE-FLOW-TOOL] Validation error (422): ${JSON.stringify(errorDetails, null, 2)}`
            );
            return {
              success: false,
              conflict: false,
              error: `YAML validation failed: ${error.response?.data?.message || error.message}`,
              details: errorDetails,
            };
          }

          console.log(`[CREATE-FLOW-TOOL] API error: ${error.message}`);
          // Log more details about the error if available
          if (error.response) {
            console.log(`[CREATE-FLOW-TOOL] Status: ${error.response.status}`);
            console.log(
              `[CREATE-FLOW-TOOL] Response data: ${JSON.stringify(error.response.data, null, 2)}`
            );
          }
          return {
            success: false,
            conflict: false,
            error: error.message,
          };
        }
      };

      // First attempt with the determined flow ID
      console.log(`[CREATE-FLOW-TOOL] Sending flow creation request...`);
      let createResult = await attemptCreateFlow(updatedYaml, finalFlowId);

      // If there's a conflict with the ID, try with a random ID instead
      if (!createResult.success && createResult.conflict) {
        const randomId = generateRandomFlowId();
        console.log(
          `[CREATE-FLOW-TOOL] Flow ID conflict detected, retrying with random ID: ${randomId}`
        );
        const retryYaml = updatedYaml.replace(/^id:\s*.*$/m, `id: ${randomId}`);
        errors.push(createResult.error);
        errors.push(`Trying again with a random ID: ${randomId}`);
        console.log(
          `[CREATE-FLOW-TOOL] Sending retry request with random ID...`
        );
        createResult = await attemptCreateFlow(retryYaml, randomId);
      }

      // Handle final result
      if (!createResult.success) {
        console.log(
          `[CREATE-FLOW-TOOL] Flow creation failed: ${createResult.error}`
        );
        errors.push(createResult.error);
        return {
          success: false,
          namespace: finalNamespace,
          status: "API_ERROR",
          errors,
          validationErrors,
        };
      }

      console.log(`[CREATE-FLOW-TOOL] Flow creation successful!`);

      // Generate Kestra UI link
      const kestraUrl = process.env.KESTRA_UI_URL || "http://localhost:8100";
      const flowUrl = `${kestraUrl}/ui/main/flows/edit/${finalNamespace}/${finalFlowId}/topology`;
      console.log(`[CREATE-FLOW-TOOL] Generated flow URL: ${flowUrl}`);

      console.log(`[CREATE-FLOW-TOOL] Returning successful result`);
      return {
        success: true,
        flowId: finalFlowId,
        namespace: finalNamespace,
        status: "CREATED",
        errors,
        validationErrors,
        flowUrl,
      };
    } catch (error: any) {
      console.log(`[CREATE-FLOW-TOOL] Unexpected error: ${error.message}`);
      errors.push(`Unexpected error: ${error.message}`);
      return {
        success: false,
        namespace,
        status: "ERROR",
        errors,
        validationErrors,
      };
    }
  },
});
