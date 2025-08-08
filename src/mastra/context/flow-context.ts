import { RuntimeContext } from "@mastra/core/runtime-context";

/**
 * Singleton class to manage shared context between Kestra agents
 * This ensures that data like YAML flow definitions are properly passed
 * between agents in the network
 */
export class KestraFlowContext {
  private static instance: KestraFlowContext;
  private context: RuntimeContext;

  private constructor() {
    this.context = new RuntimeContext();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): KestraFlowContext {
    if (!KestraFlowContext.instance) {
      KestraFlowContext.instance = new KestraFlowContext();
    }
    return KestraFlowContext.instance;
  }

  /**
   * Set a value in the context
   */
  public set(key: string, value: any): void {
    this.context.set(key, value);
  }

  /**
   * Get a value from the context
   */
  public get<T>(key: string): T | undefined {
    return this.context.get(key);
  }

  /**
   * Get the runtime context object
   */
  public getRuntimeContext(): RuntimeContext {
    return this.context;
  }

  /**
   * Store flow YAML in the context
   */
  public setFlowYaml(yaml: string): void {
    this.set("flowYaml", yaml);
  }

  /**
   * Get flow YAML from the context
   */
  public getFlowYaml(): string | undefined {
    return this.get<string>("flowYaml");
  }

  /**
   * Clear all data in the context
   */
  public clear(): void {
    this.context = new RuntimeContext();
  }
}

/**
 * Helper function to get the shared flow context
 */
export const getFlowContext = (): KestraFlowContext => {
  return KestraFlowContext.getInstance();
};
