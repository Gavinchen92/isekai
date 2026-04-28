import { createServer } from "./app";

const server = createServer();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  server.log.info({ signal }, "Closing Isekai API server");

  try {
    await server.close();
    process.exit(0);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  const address = await server.listen({ host, port });
  server.log.info(`Isekai API listening at ${address}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
