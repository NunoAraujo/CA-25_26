import dotenv from "dotenv";
import pino from "pino";
import axios from "axios";
import { analysisQueue, enqueueDeadLetterJob } from "../lib/analysisQueue";
import { prisma } from "../lib/prisma";

dotenv.config();

const logger = pino();
const analysisApiUrl = process.env.ANALYSIS_API_URL ?? "http://analysis:8000";
const analysisCallbackBaseUrl =
  process.env.ANALYSIS_CALLBACK_URL ?? "http://api:3000/api/journals";

function inferAudioFormat(audioObjectKey: string) {
  const extension = audioObjectKey.split(".").pop()?.toLowerCase();

  if (!extension) {
    return "wav";
  }

  if (extension === "mp3") {
    return "mpeg";
  }

  if (extension === "ogg") {
    return "ogg";
  }

  if (extension === "webm") {
    return "webm";
  }

  return "wav";
}

analysisQueue.process("analyze-journal", async (job) => {
  const { journalId, audioUrl, durationSeconds, language, audioObjectKey } =
    job.data;
  const audioFormat = inferAudioFormat(audioObjectKey);
  const callbackUrl = `${analysisCallbackBaseUrl}/${journalId}/analysis-callback`;

  logger.info(
    { journalId, jobId: job.id, audioFormat },
    "Dispatching analysis job",
  );

  await prisma.journal.update({
    where: { id: journalId },
    data: {
      status: "transcribing",
      errorMessage: null,
    },
  });

  await axios.post(`${analysisApiUrl}/api/v1/analyze`, {
    jobId: String(job.id),
    journalId,
    audioUrl,
    audioFormat,
    duration: durationSeconds,
    language,
    callbackUrl,
  });

  await prisma.journal.update({
    where: { id: journalId },
    data: {
      status: "analyzing",
      errorMessage: null,
    },
  });

  return { queued: true };
});

analysisQueue.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Analysis job dispatched successfully");
});

analysisQueue.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, err: error },
    "Analysis job dispatch failed",
  );

  if (!job) {
    return;
  }

  const configuredAttempts =
    typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  const attemptsMade =
    typeof job.attemptsMade === "number" ? job.attemptsMade : 0;
  const finalAttemptReached = attemptsMade >= configuredAttempts;

  if (!finalAttemptReached) {
    return;
  }

  const reason = error?.message ?? "Analysis dispatch failed";

  void (async () => {
    try {
      await prisma.journal.update({
        where: { id: job.data.journalId },
        data: {
          status: "failed",
          errorMessage: reason,
        },
      });

      await enqueueDeadLetterJob({
        journalId: job.data.journalId,
        reason,
        attemptsMade,
        failedAt: new Date().toISOString(),
      });
    } catch (updateError) {
      logger.error(
        { jobId: job.id, journalId: job.data.journalId, err: updateError },
        "Failed to persist final analysis dispatch failure",
      );
    }
  })();
});

logger.info("Analysis worker started");
