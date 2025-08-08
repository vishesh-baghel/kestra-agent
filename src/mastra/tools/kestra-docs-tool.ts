import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";

/**
 * Interface definitions for Kestra plugin data types
 */
interface PluginItem {
  name: string;
  title: string;
  group: string;
  tasks: string[];
  triggers: string[];
  conditions: string[];
  aliases: string[];
  // Other fields omitted for brevity
}

interface PluginCache {
  plugins: PluginItem[];
  taskIndex: Map<string, string>; // Maps simplified task name to full class name
  documentationCache: Map<string, PluginDocumentation>;
  lastUpdated: Date;
}

interface PluginDocumentation {
  markdown: string;
  schema: {
    properties: any;
    outputs: any;
    definitions: any;
  };
}

interface TaskDocInfo {
  fullClassName: string;
  description: string;
  properties: Record<string, string>;
  examples: string[];
  outputs?: Record<string, string>;
  relatedTasks: string[];
}

// Global cache for plugin data
const KESTRA_API_BASE_URL = "http://localhost:8100/api/v1/main";
let pluginCache: PluginCache | null = null;

/**
 * Initialize the plugin cache by fetching all plugins from the Kestra API
 */
async function initializePluginCache(): Promise<PluginCache> {
  if (
    pluginCache &&
    new Date().getTime() - pluginCache.lastUpdated.getTime() < 3600000
  ) {
    // Cache is less than 1 hour old, return it
    return pluginCache;
  }

  try {
    console.log("[KESTRA-DOCS-TOOL] Initializing Kestra plugin cache...");
    const response = await axios.get(`${KESTRA_API_BASE_URL}/plugins`);
    const plugins = response.data as PluginItem[];

    // Create index for quick task lookups
    const taskIndex = new Map<string, string>();

    // Process all plugins and index their tasks
    plugins.forEach((plugin) => {
      if (plugin.tasks) {
        plugin.tasks.forEach((fullTaskClassName) => {
          const simpleNames = generateSearchableNames(fullTaskClassName);
          simpleNames.forEach((simpleName) => {
            taskIndex.set(simpleName.toLowerCase(), fullTaskClassName);
          });
        });
      }
    });

    // Create and return the new cache
    pluginCache = {
      plugins,
      taskIndex,
      documentationCache: new Map<string, PluginDocumentation>(),
      lastUpdated: new Date(),
    };

    console.log(
      `[KESTRA-DOCS-TOOL] Plugin cache initialized with ${plugins.length} plugins and ${taskIndex.size} task name mappings`
    );
    return pluginCache;
  } catch (error) {
    console.error(
      "[KESTRA-DOCS-TOOL] Failed to initialize plugin cache:",
      error
    );
    throw new Error("Failed to initialize Kestra plugin data");
  }
}

/**
 * Generate searchable names for a task class
 * Example: "io.kestra.plugin.core.log.Log" becomes ["Log", "log", "core.log", "log.Log"]
 */
function generateSearchableNames(fullClassName: string): string[] {
  const names: string[] = [];
  const parts = fullClassName.split(".");

  // Add the simple class name (last part)
  const className = parts[parts.length - 1];
  names.push(className);

  // Add the parent package + class name
  if (parts.length > 2) {
    names.push(`${parts[parts.length - 2]}.${className}`);
  }

  // Add plugin group + task name combinations
  // Find the plugin part (usually after "plugin")
  const pluginIndex = parts.findIndex((part) => part === "plugin");
  if (pluginIndex >= 0 && pluginIndex + 1 < parts.length) {
    const pluginType = parts[pluginIndex + 1];
    names.push(`${pluginType}.${className}`);
  }

  return names;
}

/**
 * Search for a task by name and return its full class name
 */
function findTaskByName(query: string, cache: PluginCache): string | null {
  query = query.toLowerCase();

  // Direct lookup if we have an exact match
  if (cache.taskIndex.has(query)) {
    return cache.taskIndex.get(query) || null;
  }

  // Try to find the best partial match
  let bestMatch: string | null = null;
  let maxScore = 0;

  cache.taskIndex.forEach((fullClassName, indexName) => {
    // Calculate a simple match score
    let score = 0;

    if (indexName === query)
      score += 100; // Exact match
    else if (indexName.startsWith(query))
      score += 50; // Prefix match
    else if (indexName.includes(query)) score += 25; // Contains match

    // For class name matches
    const classNameOnly = fullClassName.split(".").pop()?.toLowerCase() || "";
    if (classNameOnly === query) score += 75;
    else if (classNameOnly.startsWith(query)) score += 40;
    else if (classNameOnly.includes(query)) score += 20;

    if (score > maxScore) {
      maxScore = score;
      bestMatch = fullClassName;
    }
  });

  return bestMatch;
}

/**
 * Fetch detailed documentation for a specific task
 */
async function fetchTaskDocumentation(
  fullClassName: string
): Promise<PluginDocumentation | null> {
  // Check if we have this documentation cached
  if (pluginCache?.documentationCache.has(fullClassName)) {
    return pluginCache.documentationCache.get(fullClassName) || null;
  }

  try {
    console.log(
      `[KESTRA-DOCS-TOOL] Fetching documentation for ${fullClassName}`
    );
    const response = await axios.get(
      `${KESTRA_API_BASE_URL}/plugins/${fullClassName}`
    );
    const docData = response.data as PluginDocumentation;

    // Cache the documentation
    if (pluginCache) {
      pluginCache.documentationCache.set(fullClassName, docData);
    }

    return docData;
  } catch (error) {
    console.error(
      `[KESTRA-DOCS-TOOL] Failed to fetch documentation for ${fullClassName}:`,
      error
    );
    return null;
  }
}

/**
 * Process plugin documentation into a more usable format
 */
function processTaskDocumentation(
  fullClassName: string,
  doc: PluginDocumentation
): TaskDocInfo {
  // Extract description from schema
  const description =
    doc.schema.properties?.description || "No description available";

  // Extract properties
  const properties: Record<string, string> = {};
  const schemaProps = doc.schema.properties?.properties || {};

  Object.keys(schemaProps).forEach((propName) => {
    const propInfo = schemaProps[propName];
    const required = propInfo.$required === true ? " (required)" : "";
    properties[propName] = `${propInfo.title || propName}${required}`;
  });

  // Extract outputs
  const outputs: Record<string, string> = {};
  const outputProps = doc.schema.outputs?.properties || {};

  Object.keys(outputProps).forEach((outputName) => {
    const outputInfo = outputProps[outputName];
    outputs[outputName] = outputInfo.title || outputName;
  });

  // Extract examples
  const examples: string[] = [];
  const schemaExamples = doc.schema.properties?.$examples || [];

  schemaExamples.forEach((example: any) => {
    if (example.code) {
      examples.push(example.code);
    }
  });

  // Find related tasks (would need more context to be accurate)
  // For now, use tasks from the same package
  const relatedTasks: string[] = [];
  const packagePrefix = fullClassName.substring(
    0,
    fullClassName.lastIndexOf(".")
  );

  pluginCache?.plugins.forEach((plugin) => {
    plugin.tasks.forEach((task) => {
      if (task !== fullClassName && task.startsWith(packagePrefix)) {
        relatedTasks.push(task);
      }
    });
  });

  return {
    fullClassName,
    description,
    properties,
    examples,
    outputs,
    relatedTasks: relatedTasks.slice(0, 5), // Limit to 5 related tasks
  };
}

/**
 * Get common Kestra flow patterns
 */
function getCommonKestraPatterns() {
  return {
    flowStructure: `
Kestra flows are defined in YAML format with the following basic structure:

Required fields:
- id: Unique identifier for the flow
- namespace: Namespace to organize flows (e.g., company.team)
- tasks: List of tasks to execute

Optional fields:
- description: Human-readable description
- inputs: Input parameters for the flow
- variables: Variables that can be used throughout the flow
- triggers: Conditions that automatically start the flow
- labels: Key-value pairs for organization
    `,
    basicExamples: [
      `id: hello-world
namespace: company.team
description: A simple hello world flow

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
    ],
  };
}

/**
 * Enhanced Kestra docs tool with API integration and caching
 */
export const kestraDocsTool = createTool({
  id: "kestra-docs-tool",
  description: `Fetches Kestra documentation, syntax examples, and task information to help generate correct YAML flows. Use this when you need to understand Kestra task types, their properties, or see examples of flow syntax.`,

  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe(
        "What you want to learn about Kestra (e.g., 'log', 'http', 's3', 'email')"
      ),
    taskType: z
      .string()
      .optional()
      .describe(
        "Specific task type if looking for task documentation (e.g., 'io.kestra.plugin.core.log.Log')"
      ),
  }),

  outputSchema: z.object({
    documentation: z.string().describe("Relevant documentation content"),
    examples: z.array(z.string()).describe("YAML examples if available"),
    taskProperties: z
      .record(z.string())
      .optional()
      .describe("Task properties and their descriptions"),
    taskOutputs: z
      .record(z.string())
      .optional()
      .describe("Task output properties"),
    relatedTasks: z.array(z.string()).optional().describe("Related task types"),
  }),

  execute: async ({ context: { query, taskType } }) => {
    try {
      // Initialize/update the plugin cache
      const cache = await initializePluginCache();
      const commonPatterns = getCommonKestraPatterns();

      let documentation = "";
      let examples: string[] = [];
      let taskProperties: Record<string, string> | undefined;
      let taskOutputs: Record<string, string> | undefined;
      let relatedTasks: string[] | undefined;

      // Determine if we need to search for a task or process a specified task type
      let targetTaskType = taskType;

      if (!targetTaskType && query) {
        // Try to find a task based on the query
        const foundTaskType = findTaskByName(query, cache);
        if (foundTaskType) {
          targetTaskType = foundTaskType;
        }
      }

      if (targetTaskType) {
        // Fetch and process documentation for the specified task
        const docData = await fetchTaskDocumentation(targetTaskType);

        if (docData) {
          const taskInfo = processTaskDocumentation(targetTaskType, docData);
          documentation = taskInfo.description;
          examples = taskInfo.examples;
          taskProperties = taskInfo.properties;
          taskOutputs = taskInfo.outputs;
          relatedTasks = taskInfo.relatedTasks;
        } else {
          documentation = `Could not find documentation for task: ${targetTaskType}`;
        }
      } else {
        // Provide general flow information based on query
        const queryLower = query?.toLowerCase() || '';

        if (
          queryLower.includes("flow") ||
          queryLower.includes("workflow") ||
          queryLower.includes("syntax") ||
          queryLower.includes("structure")
        ) {
          documentation = commonPatterns.flowStructure;
          examples = commonPatterns.basicExamples;
        } else {
          // If no specific task was found, suggest looking at task types
          documentation = `No specific task found for query: "${query}". Here's the general flow structure:`;
          examples = [];

          // Add the flow structure information
          documentation += "\n\n" + commonPatterns.flowStructure;

          // Suggest some common task types
          documentation +=
            "\n\nYou might be interested in these common task types:";
          const commonTasks = [
            "io.kestra.plugin.core.log.Log",
            "io.kestra.plugin.core.http.Request",
            "io.kestra.plugin.core.debug.Return",
            "io.kestra.plugin.core.flow.Sequential",
            "io.kestra.plugin.core.flow.Parallel",
          ];

          relatedTasks = commonTasks;
        }
      }

      return {
        documentation,
        examples,
        taskProperties,
        taskOutputs,
        relatedTasks,
      };
    } catch (error) {
      console.error(
        "[KESTRA-DOCS-TOOL] Error fetching Kestra documentation:",
        error
      );
      return {
        documentation:
          "Error fetching documentation. Please check your query or try a different approach.",
        examples: [],
      };
    }
  },
});

// Initialize the plugin cache on module load
// This will be executed when the application starts
initializePluginCache().catch((err) => {
  console.error(
    "[KESTRA-DOCS-TOOL] Failed to initialize Kestra plugin cache:",
    err
  );
});
