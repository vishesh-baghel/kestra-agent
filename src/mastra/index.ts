import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { kestraWorkflowGeneration } from "./workflows/kestra-flow-generation";
import { kestraAgent } from "./agents/kestra-agent";
import { storage } from "./db";

export const mastra = new Mastra({
  workflows: { kestraWorkflowGeneration },
  agents: { kestraAgent },
  storage,
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
