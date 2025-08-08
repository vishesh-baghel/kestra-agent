import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getFlowContext, KestraFlowContext } from "../context/flow-context";
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
    flowYaml: z.string().describe("The complete YAML flow definition to save"),
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
    success: z
      .boolean()
      .describe("Whether the flow YAML was successfully saved"),
    message: z.string().describe("Status message about the operation"),
  }),

  execute: async (params, ctx) => {
    // Extract parameters properly from the tool context
    const contextParams = params.context || params;
    const flowYaml = contextParams.flowYaml;
    const flowId = contextParams.flowId;
    const namespace = contextParams.namespace;
    const flowPurpose = contextParams.flowPurpose;
    // const runtimeContext: RuntimeContext | undefined = ctx?.runtimeContext;
    console.log("[SAVE-FLOW-YAML-TOOL] Starting execution with params:", {
      flowYaml,
      flowId,
      namespace,
      flowPurpose,
    });

    try {
      if (!flowYaml) {
        return {
          success: false,
          message: "No flow YAML provided to save",
        };
      }

      // Save to KestraFlowContext (singleton)
      const flowContext = getFlowContext();
      flowContext.setFlowYaml(flowYaml);

      // If we have additional flow metadata, save it too
      if (flowId) {
        flowContext.set("flowId", flowId);
      }

      if (namespace) {
        flowContext.set("namespace", namespace);
      }

      if (flowPurpose) {
        flowContext.set("flowPurpose", flowPurpose);
      }

      // Instead of directly accessing RuntimeContext, create a new one to store flow data
      try {
        // First attempt to find RuntimeContext from ctx if available
        let runtimeContext =
          ctx && typeof ctx === "object" && "runtimeContext" in ctx
            ? (ctx.runtimeContext as RuntimeContext)
            : undefined;

        // If we have a RuntimeContext instance, use it
        if (runtimeContext) {
          console.log("✅ Found RuntimeContext, storing YAML data");
          // Store the YAML content
          extractAndStoreYaml(flowYaml, runtimeContext);

          // Also store additional metadata
          if (flowId) {
            runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_ID, flowId);
          }
          if (namespace) {
            runtimeContext.set(FLOW_CONTEXT_KEYS.FLOW_NAMESPACE, namespace);
          }
        } else {
          console.log(
            "⚠️ No RuntimeContext available, but KestraFlowContext was updated"
          );
        }
      } catch (error) {
        console.warn(
          "⚠️ Could not store flow in RuntimeContext, but KestraFlowContext was updated",
          error
        );
      }

      // Get the stored values to verify and include in response
      const savedYaml = flowContext.getFlowYaml();
      const savedFlowId = flowContext.get("flowId");
      const savedNamespace = flowContext.get("namespace");
      const savedFlowPurpose = flowContext.get("flowPurpose");
      
      // Detailed verification logging
      console.log("=== FLOW YAML STORAGE VERIFICATION ===");
      console.log("YAML stored in KestraFlowContext:", !!savedYaml);
      console.log("YAML length in KestraFlowContext:", savedYaml ? savedYaml.length : 0);
      console.log("FlowId stored in KestraFlowContext:", savedFlowId || "<not stored>");
      console.log("Namespace stored in KestraFlowContext:", savedNamespace || "<not stored>");
      console.log("Flow purpose stored in KestraFlowContext:", savedFlowPurpose || "<not stored>");
      console.log("=== END VERIFICATION ===");
      
      console.log(
        "✅ Flow YAML and metadata successfully saved to shared context"
      );

      return {
        success: true,
        message: "Flow YAML successfully saved to shared context for execution agent",
        data: {
          yamlStored: !!savedYaml,
          yamlLength: savedYaml ? savedYaml.length : 0,
          flowId: savedFlowId || null,
          namespace: savedNamespace || null,
          flowPurpose: savedFlowPurpose || null,
          yamlPreview: savedYaml ? `${savedYaml.substring(0, 100)}...` : null
        }
      };
    } catch (error) {
      console.error("❌ Error saving flow YAML to context:", error);

      return {
        success: false,
        message: `Error saving flow YAML: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
