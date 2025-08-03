import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";

/**
 * Tool to fetch Kestra documentation and syntax examples
 * Helps generate correct YAML syntax for flows
 */
export const kestraDocsTool = createTool({
  id: "kestra-docs-tool",
  description: `Fetches Kestra documentation, syntax examples, and task information to help generate correct YAML flows. Use this when you need to understand Kestra task types, their properties, or see examples of flow syntax.`,
  inputSchema: z.object({
    query: z.string().describe("What you want to learn about Kestra (e.g., 'log task', 'http request', 'flow syntax', 'task types')"),
    taskType: z.string().optional().describe("Specific task type if looking for task documentation (e.g., 'io.kestra.plugin.core.log.Log')"),
  }),
  outputSchema: z.object({
    documentation: z.string().describe("Relevant documentation content"),
    examples: z.array(z.string()).describe("YAML examples if available"),
    taskProperties: z.record(z.string()).optional().describe("Task properties and their descriptions"),
    relatedTasks: z.array(z.string()).optional().describe("Related task types"),
  }),
  execute: async ({ context: { query, taskType } }) => {
    try {
      // For now, we'll provide common Kestra patterns and documentation
      // In a production version, this could scrape the actual Kestra docs
      
      const commonPatterns = getCommonKestraPatterns();
      const taskDocs = getTaskDocumentation();
      
      // Find relevant documentation based on query
      let documentation = "";
      let examples: string[] = [];
      let taskProperties: Record<string, string> | undefined;
      let relatedTasks: string[] | undefined;
      
      const queryLower = query.toLowerCase();
      
      if (taskType) {
        const taskInfo = taskDocs[taskType as keyof typeof taskDocs];
        if (taskInfo) {
          documentation = taskInfo.description;
          examples = taskInfo.examples;
          taskProperties = taskInfo.properties;
          relatedTasks = taskInfo.related;
        }
      } else {
        // Search for relevant patterns
        if (queryLower.includes('log') || queryLower.includes('print')) {
          documentation = taskDocs['io.kestra.plugin.core.log.Log'].description;
          examples = taskDocs['io.kestra.plugin.core.log.Log'].examples;
          taskProperties = taskDocs['io.kestra.plugin.core.log.Log'].properties;
        } else if (queryLower.includes('http') || queryLower.includes('api') || queryLower.includes('request')) {
          documentation = taskDocs['io.kestra.plugin.core.http.Request'].description;
          examples = taskDocs['io.kestra.plugin.core.http.Request'].examples;
          taskProperties = taskDocs['io.kestra.plugin.core.http.Request'].properties;
        } else if (queryLower.includes('bash') || queryLower.includes('shell') || queryLower.includes('script')) {
          documentation = taskDocs['io.kestra.plugin.scripts.shell.Commands'].description;
          examples = taskDocs['io.kestra.plugin.scripts.shell.Commands'].examples;
          taskProperties = taskDocs['io.kestra.plugin.scripts.shell.Commands'].properties;
        } else if (queryLower.includes('flow') || queryLower.includes('workflow') || queryLower.includes('syntax') || queryLower.includes('structure')) {
          documentation = commonPatterns.workflowStructure;
          examples = commonPatterns.basicExamples;
        } else {
          // Default to basic workflow information
          documentation = commonPatterns.workflowStructure;
          examples = commonPatterns.basicExamples;
        }
      }
      
      return {
        documentation,
        examples,
        taskProperties,
        relatedTasks,
      };
    } catch (error) {
      console.error('Error fetching Kestra documentation:', error);
      return {
        documentation: "Error fetching documentation. Please check your query or try a different approach.",
        examples: [],
      };
    }
  },
});

function getCommonKestraPatterns() {
  return {
    workflowStructure: `
Kestra workflows are defined in YAML format with the following basic structure:

Required fields:
- id: Unique identifier for the workflow
- namespace: Namespace to organize workflows (e.g., company.team)
- tasks: List of tasks to execute

Optional fields:
- description: Human-readable description
- inputs: Input parameters for the workflow
- variables: Variables that can be used throughout the workflow
- triggers: Conditions that automatically start the workflow
- labels: Key-value pairs for organization
    `,
    basicExamples: [
      `id: hello-world
namespace: company.team
description: A simple hello world workflow

tasks:
  - id: hello
    type: io.kestra.plugin.core.log.Log
    message: "Hello World!"`,
      
      `id: simple-api-call
namespace: company.team
description: Make an HTTP request

tasks:
  - id: fetch-data
    type: io.kestra.plugin.core.http.Request
    uri: "https://api.github.com/users/octocat"
    method: GET`,
    ]
  };
}

function getTaskDocumentation() {
  return {
    'io.kestra.plugin.core.log.Log': {
      description: "Log task outputs a message to the execution logs. Useful for debugging and providing user feedback.",
      properties: {
        message: "The message to log (required)",
        level: "Log level: TRACE, DEBUG, INFO, WARN, ERROR (default: INFO)"
      },
      examples: [
        `- id: log-message
  type: io.kestra.plugin.core.log.Log
  message: "Processing started"`,
        
        `- id: log-with-variable
  type: io.kestra.plugin.core.log.Log
  message: "Hello {{ inputs.name }}!"
  level: INFO`
      ],
      related: ['io.kestra.plugin.core.debug.Return']
    },
    
    'io.kestra.plugin.core.http.Request': {
      description: "HTTP Request task makes HTTP calls to external APIs and services.",
      properties: {
        uri: "The URL to call (required)",
        method: "HTTP method: GET, POST, PUT, DELETE (default: GET)",
        headers: "HTTP headers as key-value pairs",
        body: "Request body for POST/PUT requests",
        contentType: "Content type for the request body"
      },
      examples: [
        `- id: get-request
  type: io.kestra.plugin.core.http.Request
  uri: "https://api.example.com/data"
  method: GET`,
        
        `- id: post-request
  type: io.kestra.plugin.core.http.Request
  uri: "https://api.example.com/data"
  method: POST
  contentType: "application/json"
  body: |
    {
      "name": "{{ inputs.name }}",
      "value": "{{ inputs.value }}"
    }`
      ],
      related: ['io.kestra.plugin.core.http.Download']
    },
    
    'io.kestra.plugin.scripts.shell.Commands': {
      description: "Execute shell commands and scripts in a containerized environment.",
      properties: {
        commands: "List of shell commands to execute (required)",
        docker: "Docker image configuration",
        env: "Environment variables",
        workingDir: "Working directory for command execution"
      },
      examples: [
        `- id: shell-command
  type: io.kestra.plugin.scripts.shell.Commands
  commands:
    - echo "Hello from shell"
    - date`,
        
        `- id: shell-with-docker
  type: io.kestra.plugin.scripts.shell.Commands
  docker:
    image: "ubuntu:latest"
  commands:
    - apt-get update
    - echo "Running in Ubuntu container"`
      ],
      related: ['io.kestra.plugin.scripts.python.Script', 'io.kestra.plugin.scripts.node.Script']
    },
    
    'io.kestra.plugin.core.debug.Return': {
      description: "Return task outputs a value that can be used by other tasks or as workflow output.",
      properties: {
        format: "The value to return (required)"
      },
      examples: [
        `- id: return-value
  type: io.kestra.plugin.core.debug.Return
  format: "Processing completed successfully"`,
        
        `- id: return-json
  type: io.kestra.plugin.core.debug.Return
  format: |
    {
      "status": "success",
      "timestamp": "{{ taskrun.startDate }}"
    }`
      ],
      related: ['io.kestra.plugin.core.log.Log']
    }
  };
}
