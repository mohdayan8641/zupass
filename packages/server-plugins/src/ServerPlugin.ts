export interface ServerPlugin {
  name: string;
  start(context: PluginContext): Promise<void>;
  stop(): Promise<void>;
  isStarted: boolean;
}

export interface PluginContext {}
