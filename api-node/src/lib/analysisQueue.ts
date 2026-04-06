import Queue from "bull";

const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";

export type AnalysisJobPayload = {
  journalId: string;
  audioObjectKey: string;
  audioUrl: string;
  durationSeconds: number;
  language: string;
};

export type AnalysisDeadLetterPayload = {
  journalId: string;
  reason: string;
  attemptsMade: number;
  failedAt: string;
};

export const analysisQueue = new Queue<AnalysisJobPayload>(
  "analysis",
  redisUrl,
);

export const analysisDeadLetterQueue = new Queue<AnalysisDeadLetterPayload>(
  "analysis-dead-letter",
  redisUrl,
);

export async function enqueueAnalysisJob(payload: AnalysisJobPayload) {
  return analysisQueue.add("analyze-journal", payload, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 50,
    removeOnFail: 100,
  });
}

export async function enqueueDeadLetterJob(payload: AnalysisDeadLetterPayload) {
  return analysisDeadLetterQueue.add("analysis-dispatch-failed", payload, {
    removeOnComplete: 200,
    removeOnFail: 200,
  });
}
