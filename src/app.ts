import { join } from "node:path";
import AutoLoad, { AutoloadPluginOptions } from "@fastify/autoload";
import { FastifyError, FastifyPluginAsync, FastifyServerOptions } from "fastify";
import "dotenv/config";

export interface AppOptions
  extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}
// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {};

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  // Place here your custom code!

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  void fastify.register(AutoLoad, {
    dir: join(__dirname, "plugins"),
    options: opts,
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  void fastify.register(AutoLoad, {
    dir: join(__dirname, "routes"),
    options: opts,
  });

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(
      {
        err: error,
        method: request.method,
        url: request.url,
        requestId: request.id,
      },
      "request error",
    );

    if (reply.sent) {
      return;
    }

    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name ?? "Error",
      message: error.message ?? "Internal Server Error",
    });
  });

  fastify.addHook("onReady", async () => {
    fastify.log.info("\n" + fastify.printRoutes());
  });
};

export default app;
export { app, options };
