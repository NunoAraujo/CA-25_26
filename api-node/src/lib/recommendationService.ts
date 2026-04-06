import { prisma } from "./prisma";
import { getOrCreateDefaultUser } from "./defaultUser";
import {
  EmotionKey,
  buildDailyMetrics,
  clamp01,
  computeEmotionPriority,
  inferContraindications,
  recommendationRationale,
  startOfDayUTC,
} from "./recommendationAnalytics";

export type GenerateDailyRecommendationsResult = {
  status: 200 | 201;
  payload: Record<string, unknown>;
};

export async function generateDailyRecommendations(
  dayStartInput?: Date,
): Promise<GenerateDailyRecommendationsResult> {
  const user = await getOrCreateDefaultUser();
  const dayStart = dayStartInput
    ? startOfDayUTC(dayStartInput)
    : startOfDayUTC(new Date());
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const journals = await prisma.journal.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: "complete",
      uploadedAt: {
        gte: dayStart,
        lt: dayEnd,
      },
    },
    select: {
      joyScore: true,
      sadnessScore: true,
      angerScore: true,
      anxietyScore: true,
      calmScore: true,
      energyScore: true,
      transcription: true,
    },
  });

  if (!journals.length) {
    return {
      status: 200,
      payload: {
        message: "No completed journals found for requested day",
        dayStart,
        created: 0,
      },
    };
  }

  const emotionScores: Record<EmotionKey, number[]> = {
    joy: [],
    sadness: [],
    anger: [],
    anxiety: [],
    calm: [],
    energy: [],
  };

  for (const journal of journals) {
    if (typeof journal.joyScore === "number")
      emotionScores.joy.push(journal.joyScore);
    if (typeof journal.sadnessScore === "number")
      emotionScores.sadness.push(journal.sadnessScore);
    if (typeof journal.angerScore === "number")
      emotionScores.anger.push(journal.angerScore);
    if (typeof journal.anxietyScore === "number")
      emotionScores.anxiety.push(journal.anxietyScore);
    if (typeof journal.calmScore === "number")
      emotionScores.calm.push(journal.calmScore);
    if (typeof journal.energyScore === "number")
      emotionScores.energy.push(journal.energyScore);
  }

  const metrics = buildDailyMetrics(emotionScores);

  const contraindicationSignals = inferContraindications(
    journals
      .map((journal: { transcription: string | null }) => journal.transcription)
      .filter(
        (value: string | null): value is string => typeof value === "string",
      ),
  );

  const dailyTrend = await prisma.dailyTrend.upsert({
    where: {
      userId_dayStart: {
        userId: user.id,
        dayStart,
      },
    },
    create: {
      userId: user.id,
      dayStart,
      dayEnd,
      avgJoyScore: metrics.joyAvg,
      avgSadnessScore: metrics.sadnessAvg,
      avgAngerScore: metrics.angerAvg,
      avgAnxietyScore: metrics.anxietyAvg,
      avgCalmScore: metrics.calmAvg,
      avgEnergyScore: metrics.energyAvg,
      joyTrend: metrics.joyAvg,
      sadnessTrend: metrics.sadnessAvg,
      angerTrend: metrics.angerAvg,
      anxietyTrend: metrics.anxietyAvg,
      calmTrend: metrics.calmAvg,
      energyTrend: metrics.energyAvg,
      emotionalVolatility: metrics.volatility,
      entryCount: journals.length,
      completionRate: 1,
    },
    update: {
      dayEnd,
      avgJoyScore: metrics.joyAvg,
      avgSadnessScore: metrics.sadnessAvg,
      avgAngerScore: metrics.angerAvg,
      avgAnxietyScore: metrics.anxietyAvg,
      avgCalmScore: metrics.calmAvg,
      avgEnergyScore: metrics.energyAvg,
      joyTrend: metrics.joyAvg,
      sadnessTrend: metrics.sadnessAvg,
      angerTrend: metrics.angerAvg,
      anxietyTrend: metrics.anxietyAvg,
      calmTrend: metrics.calmAvg,
      energyTrend: metrics.energyAvg,
      emotionalVolatility: metrics.volatility,
      entryCount: journals.length,
      completionRate: 1,
    },
  });

  const emotionPriority = computeEmotionPriority(metrics);
  const primaryEmotion = emotionPriority[0].key;
  const fallbackEmotion = emotionPriority[1]?.key ?? primaryEmotion;

  const feedbackWindowStart = new Date();
  feedbackWindowStart.setDate(feedbackWindowStart.getDate() - 28);

  const recentFeedback = await prisma.recommendation.findMany({
    where: {
      userId: user.id,
      feedbackAt: { gte: feedbackWindowStart },
      feedback: { in: ["positive", "negative"] },
    },
    select: {
      activityId: true,
      feedback: true,
    },
  });

  const activityFeedbackScore = new Map<string, number>();
  const activityCompletionScore = new Map<string, number>();

  for (const item of recentFeedback) {
    const current = activityFeedbackScore.get(item.activityId) ?? 0;
    const delta = item.feedback === "positive" ? 1 : -1;
    activityFeedbackScore.set(item.activityId, current + delta);
  }

  const recentCompletions = await prisma.recommendation.findMany({
    where: {
      userId: user.id,
      completedAt: { gte: feedbackWindowStart },
    },
    select: {
      activityId: true,
    },
  });

  for (const item of recentCompletions) {
    const current = activityCompletionScore.get(item.activityId) ?? 0;
    activityCompletionScore.set(item.activityId, current + 1);
  }

  const activities = await prisma.activityLibrary.findMany({
    where: {
      targetEmotions: {
        hasSome: [primaryEmotion, fallbackEmotion],
      },
      ...(contraindicationSignals.length
        ? {
            NOT: {
              contraindications: {
                hasSome: contraindicationSignals,
              },
            },
          }
        : {}),
    },
    orderBy: [{ intensity: "asc" }, { durationMin: "asc" }],
    take: 12,
  });

  if (!activities.length) {
    return {
      status: 200,
      payload: {
        message: "No matching activities found in library",
        dayStart,
        dailyTrendId: dailyTrend.id,
        created: 0,
      },
    };
  }

  await prisma.recommendation.deleteMany({
    where: {
      userId: user.id,
      dailyTrendId: dailyTrend.id,
    },
  });

  const rankedActivities = activities
    .map((activity) => {
      const feedbackScore = activityFeedbackScore.get(activity.activityId) ?? 0;
      const completionScore =
        activityCompletionScore.get(activity.activityId) ?? 0;
      return {
        activity,
        feedbackScore,
        completionScore,
      };
    })
    .sort((a, b) => {
      if (b.feedbackScore !== a.feedbackScore) {
        return b.feedbackScore - a.feedbackScore;
      }

      if (b.completionScore !== a.completionScore) {
        return b.completionScore - a.completionScore;
      }

      return a.activity.durationMin - b.activity.durationMin;
    })
    .slice(0, 3);

  const expiresAt = new Date(dayEnd);
  const createdRecommendations = [];

  for (const [index, ranked] of rankedActivities.entries()) {
    const activity = ranked.activity;
    const confidence = clamp01(
      emotionPriority[0].score -
        index * 0.08 +
        (0.5 - Math.min(metrics.volatility, 0.5)) * 0.1 +
        ranked.feedbackScore * 0.04 +
        ranked.completionScore * 0.03,
    );

    const recommendation = await prisma.recommendation.create({
      data: {
        userId: user.id,
        dailyTrendId: dailyTrend.id,
        activityId: activity.activityId,
        activityName: activity.activityName,
        activityDurationMin: activity.durationMin,
        activityIntensity: activity.intensity,
        rationale: recommendationRationale(primaryEmotion),
        confidence,
        expectedImpactMetric: primaryEmotion,
        expectedImpactDelta: Number((confidence * 0.25).toFixed(3)),
        expiresAt,
      },
    });

    createdRecommendations.push(recommendation);
  }

  return {
    status: 201,
    payload: {
      message: "Daily recommendations generated",
      dayStart,
      dailyTrend,
      recommendations: createdRecommendations,
    },
  };
}

export async function listRecommendations(dayStart?: Date) {
  const recommendations = await prisma.recommendation.findMany({
    where: {
      ...(dayStart
        ? {
            dailyTrend: {
              dayStart,
            },
          }
        : {}),
    },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
  });

  return { recommendations, total: recommendations.length };
}

export async function storeRecommendationFeedback(
  recommendationId: string,
  feedback: "positive" | "neutral" | "negative",
) {
  return prisma.recommendation.update({
    where: { id: recommendationId },
    data: {
      feedback,
      feedbackAt: new Date(),
    },
  });
}

export async function storeRecommendationCompletion(
  recommendationId: string,
  completedAt?: Date,
) {
  const completionDate = completedAt ?? new Date();

  return prisma.recommendation.update({
    where: { id: recommendationId },
    data: {
      completedAt: completionDate,
    },
  });
}
