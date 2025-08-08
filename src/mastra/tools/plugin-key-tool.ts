import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";

// Configuration
// Check if we need to append the API path
const baseUrl = process.env.KESTRA_BASE_URL || "http://localhost:8100";
const KESTRA_API_BASE_URL = baseUrl.endsWith("/api/v1/main")
  ? baseUrl
  : `${baseUrl}/api/v1/main`;

// Add debug logging flag for easier troubleshooting
const DEBUG = process.env.DEBUG_PLUGIN_KEY_TOOL || false;

// Global cache for plugin data organized by type
interface PluginClassNames {
  tasks: string[];
  triggers: string[];
  conditions: string[];
}

let pluginCache: PluginClassNames = {
  tasks: [],
  triggers: [],
  conditions: [],
};

let initialized = false;
let initializationPromise: Promise<PluginClassNames> | null = null;

/**
 * Initializes the plugin cache by fetching all plugins and organizing them by type
 */
async function initializePluginCache(): Promise<PluginClassNames> {
  // Return the existing cache if already initialized
  if (initialized) {
    return pluginCache;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      console.log("[PLUGIN-KEY-TOOL] Initializing plugin keys cache...");
      const response = await axios.get(`${KESTRA_API_BASE_URL}/plugins`);

      // Validate API response
      if (!response || !response.data) {
        throw new Error("Invalid API response: missing response data");
      }

      if (DEBUG) {
        console.log(`[PLUGIN-KEY-TOOL] Response status: ${response.status}`);
        console.log(
          `[PLUGIN-KEY-TOOL] First few items: ${JSON.stringify(response.data.slice(0, 2))}`
        );
      }

      // Ensure data is an array
      const plugins = Array.isArray(response.data) ? response.data : [];

      if (plugins.length === 0) {
        console.warn(
          "[PLUGIN-KEY-TOOL] Warning: No plugins found in API response"
        );
      }

      // Process each plugin to extract keys
      if (DEBUG) {
        console.log(`[PLUGIN-KEY-TOOL] Processing ${plugins.length} plugins`);
      }

      // Arrays to collect plugin class names by type
      let tasks: string[] = [];
      let triggers: string[] = [];
      let conditions: string[] = [];

      // Process all plugins
      plugins.forEach((plugin) => {
        if (!plugin) {
          console.warn("[PLUGIN-KEY-TOOL] Skipping null or undefined plugin");
          return;
        }

        // Collect tasks class names
        if (plugin.tasks && Array.isArray(plugin.tasks)) {
          tasks = tasks.concat(plugin.tasks.filter(Boolean));
          if (DEBUG) {
            console.log(
              `[PLUGIN-KEY-TOOL] Added ${plugin.tasks.length} tasks from ${plugin.name}`
            );
          }
        }

        // Collect triggers class names
        if (plugin.triggers && Array.isArray(plugin.triggers)) {
          triggers = triggers.concat(plugin.triggers.filter(Boolean));
          if (DEBUG) {
            console.log(
              `[PLUGIN-KEY-TOOL] Added ${plugin.triggers.length} triggers from ${plugin.name}`
            );
          }
        }

        // Collect conditions class names
        if (plugin.conditions && Array.isArray(plugin.conditions)) {
          conditions = conditions.concat(plugin.conditions.filter(Boolean));
          if (DEBUG) {
            console.log(
              `[PLUGIN-KEY-TOOL] Added ${plugin.conditions.length} conditions from ${plugin.name}`
            );
          }
        }
      });

      if (DEBUG) {
        console.log(
          `[PLUGIN-KEY-TOOL] Extracted ${tasks.length} tasks, ${triggers.length} triggers, and ${conditions.length} conditions from plugin metadata`
        );
      }

      // Sort and deduplicate class names by type
      const uniqueTasks = [...new Set(tasks)].sort();
      const uniqueTriggers = [...new Set(triggers)].sort();
      const uniqueConditions = [...new Set(conditions)].sort();

      // Store in cache
      pluginCache = {
        tasks: uniqueTasks,
        triggers: uniqueTriggers,
        conditions: uniqueConditions,
      };

      initialized = true;
      initializationPromise = null;

      console.log(
        `[PLUGIN-KEY-TOOL] Cache initialized with ${uniqueTasks.length} tasks, ${uniqueTriggers.length} triggers, and ${uniqueConditions.length} conditions`
      );

      return pluginCache;
    } catch (error) {
      console.error(
        "[PLUGIN-KEY-TOOL] Failed to initialize plugin keys cache:",
        error
      );
      initialized = true;
      initializationPromise = null;

      // Return empty object to prevent future initialization attempts
      return pluginCache;
    }
  })();

  return initializationPromise;
}

// No longer needed since we return all keys

/**
 * Plugin Key Tool for listing all available Kestra plugins by type
 * This tool returns all plugin class names organized by type (tasks, triggers, conditions)
 * to help the agent quickly find relevant plugins before using the full docs tool
 */
export const pluginKeyTool = createTool({
  id: "plugin-key-tool",
  description:
    "Returns all available Kestra plugin class names organized by type (tasks, triggers, conditions)",

  inputSchema: z.object({}),

  outputSchema: z.object({
    tasks: z
      .array(z.string())
      .describe("All task class names (e.g. 'io.kestra.plugin.core.log.Log')"),
    triggers: z
      .array(z.string())
      .describe(
        "All trigger class names (e.g. 'io.kestra.core.models.triggers.types.Schedule')"
      ),
    conditions: z
      .array(z.string())
      .describe(
        "All condition class names (e.g. 'io.kestra.plugin.core.condition.Success')"
      ),
  }),

  execute: async () => {
    try {
      // Ensure cache is initialized
      await initializePluginCache();

      // Double check that we have data in the cache
      if (!pluginCache.tasks || pluginCache.tasks.length === 0) {
        console.warn(
          "[PLUGIN-KEY-TOOL] Warning: Plugin cache is empty after initialization"
        );
        // Return some fallback data to prevent complete failure
        const fallbackPlugins = {
          tasks: [
            "io.kestra.plugin.http.Request",
            "io.kestra.plugin.s3.Copy",
            "io.kestra.plugin.core.Log",
            "io.kestra.plugin.script.Bash",
            "io.kestra.plugin.script.Python",
          ],
          triggers: [
            "io.kestra.core.models.triggers.types.Schedule",
            "io.kestra.core.models.triggers.types.Webhook",
          ],
          conditions: [
            "io.kestra.plugin.core.condition.Success",
            "io.kestra.plugin.core.condition.TimeBetween",
          ],
        };
        console.log(
          `[PLUGIN-KEY-TOOL] Using fallback plugin data with ${fallbackPlugins.tasks.length} tasks, ${fallbackPlugins.triggers.length} triggers, and ${fallbackPlugins.conditions.length} conditions`
        );
        return fallbackPlugins;
      }

      console.log(
        `[PLUGIN-KEY-TOOL] Returning ${pluginCache.tasks.length} tasks, ${pluginCache.triggers.length} triggers, and ${pluginCache.conditions.length} conditions`
      );

      return pluginCache;
    } catch (error) {
      console.error("[PLUGIN-KEY-TOOL] Error retrieving plugin data:", error);
      // Return some fallback data to prevent complete failure
      const fallbackPlugins = {
        tasks: [
          "io.kestra.plugin.http.Request",
          "io.kestra.plugin.s3.Copy",
          "io.kestra.plugin.core.Log",
          "io.kestra.plugin.script.Bash",
          "io.kestra.plugin.script.Python",
        ],
        triggers: [
          "io.kestra.core.models.triggers.types.Schedule",
          "io.kestra.core.models.triggers.types.Webhook",
        ],
        conditions: [
          "io.kestra.plugin.core.condition.Success",
          "io.kestra.plugin.core.condition.TimeBetween",
        ],
      };
      console.log(`[PLUGIN-KEY-TOOL] Using fallback plugin data due to error`);
      return fallbackPlugins;
    }
  },
});

// Initialize the plugin cache on module load
initializePluginCache().catch((err: Error) => {
  console.error("[PLUGIN-KEY-TOOL] Failed to initialize plugin cache:", err);
});
