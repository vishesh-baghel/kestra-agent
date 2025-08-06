/**
 * Example demonstrating how to use the Kestra Agent Network
 */
import dotenv from "dotenv";
dotenv.config();

import { mastra } from "../mastra";
import { RuntimeContext } from "@mastra/core/runtime-context";

async function main() {
  try {
    // Get the agent network from Mastra
    const network = mastra.vnext_getNetwork("kestra-network");

    if (!network) {
      console.error("Kestra agent network not found");
      process.exit(1);
    }

    console.log("🤖 Kestra Agent Network Example");
    console.log("-------------------------------\n");

    // Example task for the network
    const task =
      "Create a simple Kestra flow that fetches data from a REST API and stores it in a database";

    console.log(`Task: ${task}\n`);
    console.log("Processing...\n");

    const runtimeContext = new RuntimeContext();

    // Using the loop method for complex tasks that may require multiple agents
    const result = await network.loop(task, { runtimeContext });

    console.log("Result:");
    console.log(result);

    // Example of a simpler, more direct task
    console.log("\n-------------------------------\n");

    const simpleTask = "What are the best practices for naming Kestra flows?";

    console.log(`Simple Task: ${simpleTask}\n`);
    console.log("Processing...\n");

    // Using the generate method for simpler tasks
    const simpleResult = await network.generate(simpleTask, { runtimeContext });

    console.log("Result:");
    console.log(simpleResult);
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
