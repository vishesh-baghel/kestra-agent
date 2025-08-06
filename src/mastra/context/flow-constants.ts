/**
 * Constants for Kestra flow context keys
 * These keys are used to store and retrieve flow-related data
 * in the RuntimeContext shared between agents
 */

export const FLOW_CONTEXT_KEYS = {
  // Key for storing the YAML flow definition
  FLOW_YAML: 'kestraFlowYaml',
  
  // Key for storing the flow ID after creation
  FLOW_ID: 'kestraFlowId',
  
  // Key for storing the flow namespace
  FLOW_NAMESPACE: 'kestraFlowNamespace',
  
  // Key for user execution preference (auto/manual)
  USER_EXECUTION_PREFERENCE: 'kestraUserExecutionPreference'
};
