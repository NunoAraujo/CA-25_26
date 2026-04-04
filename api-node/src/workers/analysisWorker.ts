import dotenv from "dotenv";
import pino from "pino";
import axios from "axios";
import { analysisQueue } from "../lib/analysisQueue";
import { prisma } from "../lib/prisma";

dotenv.config();

const logger = pino();
const analysisApiUrl = process.env.ANALYSIS_API_URL ?? "http://analysis:8000";

analysisQueue.process("analyze-journal", async (job) => {
  const { journalId, audioUrl, durationSeconds, language } = job.data;

  logger.info({ journalId, jobId: job.id }, "Dispatching analysis job");

  await prisma.journal.update({
    where: { id: journalId },
    data: { status: "transcribing" },
  });

  await axios.post(`${analysisApiUrl}/api/v1/analyze`, {
    jobId: String(job.id),
    journalId,
    audioUrl,
    audioFormat: "webm",
    duration: durationSeconds,
    language,
  });

  return { queued: true };
});

analysisQueue.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Analysis job dispatched successfully");
});

analysisQueue.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error }, "Analysis job dispatch failed");
});

logger.info("Analysis worker started");
