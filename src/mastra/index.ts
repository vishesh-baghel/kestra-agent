import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { registerApiRoute } from "@mastra/core/server";
import { kestraFlowGeneration } from "./workflows/kestra-flow-generation";
import * as agents from "./agents";
import { storage } from "./db";
import { kestraAgentNetwork } from "./networks/kestra-agent-network";

export const mastra = new Mastra({
  workflows: { kestraFlowGeneration },
  agents,
  storage,
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  vnext_networks: {
    "kestra-network": kestraAgentNetwork,
  },
  server: {
    apiRoutes: [
      registerApiRoute("/kestra-agent-stream", {
        method: "POST",
        handler: async (c: any) => {
          const mastra = c.get("mastra");
          const { messages } = await c.req.json();
          
          const agent = mastra.getAgent("kestraFlowDesignAgent");
          
          // Use regular stream method as recommended by Assistant UI docs
          const result = await agent.stream(messages, {
            memory: {
              thread: c.req.header('x-thread-id') || 'default-thread',
              resource: c.req.header('x-resource-id') || 'default-user'
            }
          });
          
          return result.toDataStreamResponse();
        },
      }),
    ],
  },
});
