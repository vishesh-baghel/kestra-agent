import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { kestraFlowGeneration } from "./workflows/kestra-flow-generation";
import * as agents from "./agents";
import { storage } from "./db";

export const mastra = new Mastra({
  workflows: { kestraFlowGeneration },
  agents,
  storage,
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
