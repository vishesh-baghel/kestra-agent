import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as yaml from "yaml";

const KESTRA_BASE_URL = process.env.KESTRA_BASE_URL || "http://localhost:8100";

/**
 * Tool to create a new Kestra flow from YAML definition
 * This tool should be used only once at the start of a conversation to create a new flow
 */
export const createFlowTool = createTool({
  id: "create-flow-tool",
  description: `Creates a new Kestra flow from YAML definition. This tool validates the YAML syntax and creates the flow in Kestra. Use this tool only once at the start of a conversation to create a new flow. For modifications, use the edit-flow-tool instead.`,
  inputSchema: z.object({
    flowYaml: z.string().describe("The complete YAML flow definition to create"),
    namespace: z.string().default("company.team").describe("Kestra namespace for the flow"),
    flowId: z.string().optional().describe("Specific flow ID (will be extracted from YAML if not provided)"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the flow was successfully created"),
    flowId: z.string().optional().describe("The flow ID that was created"),
    namespace: z.string().describe("The namespace used"),
    status: z.string().describe("Creation status (CREATED, VALIDATION_FAILED, etc.)"),
    errors: z.array(z.string()).describe("Any errors encountered during creation"),
    validationErrors: z.array(z.string()).describe("YAML validation errors"),
    flowUrl: z.string().optional().describe("URL to view the flow in Kestra UI"),
  }),
  execute: async ({ context: { flowYaml, namespace, flowId } }) => {
    const errors: string[] = [];
    const validationErrors: string[] = [];
    
    try {
      // Step 1: Validate YAML syntax
      let parsedYaml: any;
      try {
        parsedYaml = yaml.parse(flowYaml);
      } catch (yamlError: any) {
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
      if (!parsedYaml.id) {
        validationErrors.push("Flow must have an 'id' field");
      }
      
      if (!parsedYaml.namespace) {
        validationErrors.push("Flow must have a 'namespace' field");
      }
      
      if (!parsedYaml.tasks || !Array.isArray(parsedYaml.tasks) || parsedYaml.tasks.length === 0) {
        validationErrors.push("Flow must have at least one task in the 'tasks' array");
      }
      
      if (validationErrors.length > 0) {
        return {
          success: false,
          namespace,
          status: "VALIDATION_FAILED",
          errors,
          validationErrors,
        };
      }
      
      const finalFlowId = flowId || parsedYaml.id;
      const finalNamespace = parsedYaml.namespace || namespace;
      
      // Step 3: Create flow in Kestra
      try {
        const createResponse = await axios.post(
          `${KESTRA_BASE_URL}/api/v1/flows`,
          flowYaml,
          {
            headers: {
              "Content-Type": "application/x-yaml",
            },
          }
        );
        
        if (createResponse.status === 200 || createResponse.status === 201) {
          return {
            success: true,
            flowId: finalFlowId,
            namespace: finalNamespace,
            status: "CREATED",
            errors: [],
            validationErrors: [],
            flowUrl: `${KESTRA_BASE_URL}/ui/flows/${finalNamespace}/${finalFlowId}`,
          };
        } else {
          errors.push(`Failed to create flow: HTTP ${createResponse.status}`);
          return {
            success: false,
            namespace: finalNamespace,
            status: "CREATION_FAILED",
            errors,
            validationErrors: [],
          };
        }
      } catch (createError: any) {
        const errorMessage = createError.response?.data?.message || createError.message || "Unknown error during flow creation";
        errors.push(`Flow creation failed: ${errorMessage}`);
        
        return {
          success: false,
          namespace: finalNamespace,
          status: "CREATION_FAILED",
          errors,
          validationErrors: [],
        };
      }
    } catch (error: any) {
      errors.push(`Unexpected error: ${error.message}`);
      return {
        success: false,
        namespace,
        status: "ERROR",
        errors,
        validationErrors: [],
      };
    }
  },
});
