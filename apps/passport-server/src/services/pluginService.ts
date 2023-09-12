import { PluginContext, ServerPlugin } from "@pcd/server-plugins";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { RollbarService } from "./rollbarService";

export class PluginService {
  private readonly rollbarService: RollbarService | null;
  private readonly plugins: ServerPlugin[];

  public constructor(
    plugins: ServerPlugin[],
    rollbarService: RollbarService | null
  ) {
    this.rollbarService = rollbarService;
    this.plugins = plugins;
  }

  public async stop(): Promise<void> {
    logger("[PLUGINS] stopping server plugins");

    for (const plugin of this.plugins) {
      try {
        await plugin.stop();
      } catch (e) {
        logger(`[PLUGINS] failed to stop plugin ${plugin.name}`, e);
        this.rollbarService?.reportError(e);
      }
    }
  }
}

export async function startPluginService(
  context: ApplicationContext,
  rollbarService: RollbarService | null
): Promise<PluginService> {
  logger("[PLUGINS] starting server plugins");

  const pluginContext: PluginContext = {};
  const plugins: ServerPlugin[] = [];

  for (const plugin of plugins) {
    try {
      await plugin.start(pluginContext);
    } catch (e) {
      logger(`[PLUGINS] failed to start plugin ${plugin.name}`, e);
      rollbarService?.reportError(e);
    }
  }

  return new PluginService(plugins, rollbarService);
}
