import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getFlowContext } from "../context/flow-context";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { FLOW_CONTEXT_KEYS } from "../context/flow-constants";
import { extractAndStoreYaml } from "../utils/yaml-interceptor";

/**
 * Tool to save flow YAML to the shared KestraFlowContext
 * Used by the design agent when user approves executing and testing a flow
 */
export const saveFlowYamlTool = createTool({
  id: "save-flow-yaml-tool",
  description: `Saves the flow YAML definition to the shared KestraFlowContext for access by the execution agent.
  Use this tool when the user approves executing and testing a flow, to ensure the flow YAML is properly shared.`,
  
  inputSchema: z.object({
    flowYaml: z
      .string()
      .describe("The complete YAML flow definition to save"),
    flowId: z
      .string()
      .optional()
      .describe("Optional flow ID to associate with this YAML"),
    namespace: z
      .string()
      .optional()
      .default("company.team")
      .describe("Optional namespace for the flow"),
    flowPurpose: z
      .string()
      .optional()
      .describe("Brief description of flow purpose"),
  }),
  
  outputSchema: z.object({
    success: z.boolean().describe("Whether the flow YAML was successfully saved"),
    message: z.string().describe("Status message about the operation"),
  }),
  
  execute: async (params: any, ctx?: any) => {
    console.log("[SAVE-FLOW-YAML-TOOL] Starting execution with params:", params);
    
    try {
      // Extract parameters
      const flowYaml = params.flowYaml;
      const flowId = params.flowId;
      const namespace = params.namespace;
      const flowPurpose = params.flowPurpose;
      
      if (!flowYaml) {
        return {
          success: false,
          message: "No flow YAML provided to save"
        };
      }
      
      // Save to KestraFlowContext (singleton)
      const flowContext = getFlowContext();
      flowContext.setFlowYaml(flowYaml);
      
      // If we have additional flow metadata, save it too
      if (flowId) {
        flowContext.set('flowId', flowId);
      }
      
      if (namespace) {
        flowContext.set('namespace', namespace);
      }
      
      if (flowPurpose) {
        flowContext.set('flowPurpose', flowPurpose);
      }
      
      // Also save to RuntimeContext if available
      const runtimeContext: RuntimeContext | undefined = ctx?.runtimeContext;
      if (runtimeContext) {
        // Store the YAML directly
        runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_YAML, flowYaml);
        
        // Also try to extract YAML if it's embedded in markdown
        extractAndStoreYaml(flowYaml, runtimeContext);
        
        // Store additional metadata
        if (flowId) {
          runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_ID, flowId);
        }
        
        if (namespace) {
          runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_NAMESPACE, namespace);
        }
        
        console.log("✅ Stored flow YAML and metadata in RuntimeContext");
      }
      
      console.log("✅ Flow YAML and metadata successfully saved to shared context");
      
      return {
        success: true,
        message: "Flow YAML successfully saved to shared context for execution agent"
      };
    } catch (error) {
      console.error("❌ Error saving flow YAML to context:", error);
      
      return {
        success: false,
        message: `Error saving flow YAML: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  },
});
