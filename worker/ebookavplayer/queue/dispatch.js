import { handleIngestMessage } from "./ingest-consumer.js";

import { emitJobEvent } from "../_shared/job-events.js";



async function emitStarted(env, message) {

  const { job_id, kind } = message.body || {};

  if (!job_id) return;

  await emitJobEvent(env, job_id, {

    type: "started",

    ts: Date.now(),

    status: "processing",

    kind: kind || "ingest",

  });

}



/** Route queue messages by kind. */

export async function onQueueBatch(batch, env) {

  for (const message of batch.messages) {

    const kind = message.body?.kind || "pack-build";

    try {

      if (kind === "ingest" || kind === "continue-extract") {

        await emitStarted(env, message);

        await handleIngestMessage(message, env);

        continue;

      }

      if (kind === "re-extract") {

        await emitStarted(env, message);

        const { handleReExtractMessage } = await import("./re-extract-consumer.js");

        await handleReExtractMessage(message, env);

        continue;

      }

      if (kind === "imaging-regen") {

        await emitStarted(env, message);

        const { handleImagingRegenMessage } = await import("./imaging-regen-consumer.js");

        await handleImagingRegenMessage(message, env);

        continue;

      }

      if (kind === "moment-generate") {

        await emitStarted(env, message);

        const { handleMomentGenerateMessage } = await import("./moment-generate-consumer.js");

        await handleMomentGenerateMessage(message, env);

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

