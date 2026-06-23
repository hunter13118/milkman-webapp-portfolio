import { handleIngestMessage } from "./ingest-consumer.js";

/** Route queue messages by kind. */
export async function onQueueBatch(batch, env) {
  for (const message of batch.messages) {
    const kind = message.body?.kind || "pack-build";
    try {
      if (kind === "ingest") {
        await handleIngestMessage(message, env);
        continue;
      }
      if (kind === "pack-build") {
        const { handlePackBuildMessage } = await import("./pack-build-consumer.js");
        await handlePackBuildMessage(message, env);
        continue;
      }
      console.error("unknown queue kind", kind);
      message.retry();
    } catch (e) {
      console.error("queue dispatch", e);
      message.retry();
    }
  }
}
