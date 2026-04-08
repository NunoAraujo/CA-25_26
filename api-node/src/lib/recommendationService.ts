import { ActivityIntensity } from "@prisma/client";
import { prisma } from "./prisma";
import { getOrCreateDefaultUser } from "./defaultUser";
import {
  EmotionKey,
  buildDailyMetrics,
  clamp01,
  computeEmotionPriority,
  startOfDayUTC,
} from "./recommendationAnalytics";
import {
  generateLlmRecommendations,
  LlmRecommendationError,
  LlmRecommendationOutput,
} from "./llmRecommendationService";

type RecommendationTemplate = {
  templateId: string;
  activityName: string;
  activityDurationMin: number;
  activityIntensity: ActivityIntensity;
  category: string;
  targetEmotions: EmotionKey[];
  contraindications: string[];
};

type PriorityEmotionKey = EmotionKey | "low_energy";

type JournalEmotionSample = {
  joyScore: number | null;
  sadnessScore: number | null;
  angerScore: number | null;
  anxietyScore: number | null;
  calmScore: number | null;
  energyScore: number | null;
  transcription: string | null;
};

const RECOMMENDATION_TEMPLATES: RecommendationTemplate[] = [
  {
    templateId: "breathing-box-5",
    activityName: "Respiracao Ritmada",
    activityDurationMin: 5,
    activityIntensity: ActivityIntensity.low,
    category: "breathing",
    targetEmotions: ["anxiety", "anger"],
    contraindications: ["hiperventilacao", "desconforto respiratorio agudo"],
  },
  {
    templateId: "mindfulness-body-scan-10",
    activityName: "Body Scan Curto",
    activityDurationMin: 10,
    activityIntensity: ActivityIntensity.low,
    category: "mindfulness",
    targetEmotions: ["anxiety", "sadness"],
    contraindications: ["dor intensa sem acompanhamento medico"],
  },
  {
    templateId: "grounding-sensory-7",
    activityName: "Grounding Sensorial",
    activityDurationMin: 7,
    activityIntensity: ActivityIntensity.low,
    category: "grounding",
    targetEmotions: ["anxiety", "anger"],
    contraindications: [],
  },
  {
    templateId: "movement-walk-15",
    activityName: "Caminhada Consciente",
    activityDurationMin: 15,
    activityIntensity: ActivityIntensity.medium,
    category: "movement",
    targetEmotions: ["sadness", "energy"],
    contraindications: ["lesao ortopedica sem liberacao"],
  },
  {
    templateId: "cognitive-reframe-10",
    activityName: "Reestruturacao Cognitiva",
    activityDurationMin: 10,
    activityIntensity: ActivityIntensity.medium,
    category: "cognitive",
    targetEmotions: ["anxiety", "sadness", "anger"],
    contraindications: [],
  },
  {
    templateId: "activation-energy-12",
    activityName: "Ativacao de Energia",
    activityDurationMin: 12,
    activityIntensity: ActivityIntensity.medium,
    category: "activation",
    targetEmotions: ["energy", "calm"],
    contraindications: ["fadiga extrema"],
  },
];

function normalizePriorityEmotion(emotion: PriorityEmotionKey): EmotionKey {
  return emotion === "low_energy" ? "energy" : emotion;
}

function resolveTemplatesForEmotion(
  primaryEmotion: PriorityEmotionKey,
  fallbackEmotion: PriorityEmotionKey,
) {
  const normalizedPrimary = normalizePriorityEmotion(primaryEmotion);
  const normalizedFallback = normalizePriorityEmotion(fallbackEmotion);
  const direct = RECOMMENDATION_TEMPLATES.filter((template) =>
    template.targetEmotions.some(
      (emotion) =>
        emotion === normalizedPrimary || emotion === normalizedFallback,
    ),
  );

  return direct.length ? direct : RECOMMENDATION_TEMPLATES;
}

function pickUniqueRecommendations(
  llmOutput: LlmRecommendationOutput[],
  templates: RecommendationTemplate[],
) {
  const templateById = new Map(
    templates.map((template) => [template.templateId, template]),
  );
  const usedTemplateIds = new Set<string>();
  const selected: Array<{
    template: RecommendationTemplate;
    llm: LlmRecommendationOutput;
  }> = [];

  for (const [index, item] of llmOutput.entries()) {
    const resolvedTemplate = item.templateId
      ? templateById.get(item.templateId)
      : templates[index];
    if (!resolvedTemplate || usedTemplateIds.has(resolvedTemplate.templateId)) {
      continue;
    }

    usedTemplateIds.add(resolvedTemplate.templateId);
    selected.push({ template: resolvedTemplate, llm: item });

    if (selected.length >= 3) {
      break;
    }
  }

  return selected;
}

function collectEmotionScores(journals: JournalEmotionSample[]) {
  const emotionScores: Record<EmotionKey, number[]> = {
    joy: [],
    sadness: [],
    anger: [],
    anxiety: [],
    calm: [],
    energy: [],
  };

  for (const journal of journals) {
    if (typeof journal.joyScore === "number") {
      emotionScores.joy.push(journal.joyScore);
    }
    if (typeof journal.sadnessScore === "number") {
      emotionScores.sadness.push(journal.sadnessScore);
    }
    if (typeof journal.angerScore === "number") {
      emotionScores.anger.push(journal.angerScore);
    }
    if (typeof journal.anxietyScore === "number") {
      emotionScores.anxiety.push(journal.anxietyScore);
    }
    if (typeof journal.calmScore === "number") {
      emotionScores.calm.push(journal.calmScore);
    }
    if (typeof journal.energyScore === "number") {
      emotionScores.energy.push(journal.energyScore);
    }
  }

  return emotionScores;
}

async function loadActivityHistoryScores(userId: string, since: Date) {
  const recentFeedback = await prisma.recommendation.findMany({
    where: {
      userId,
      feedbackAt: { gte: since },
      feedback: { in: ["positive", "negative"] },
    },
    select: {
      activityId: true,
      feedback: true,
    },
  });

  const feedbackScore = new Map<string, number>();
  for (const item of recentFeedback) {
    const current = feedbackScore.get(item.activityId) ?? 0;
    const delta = item.feedback === "positive" ? 1 : -1;
    feedbackScore.set(item.activityId, current + delta);
  }

  const recentCompletions = await prisma.recommendation.findMany({
    where: {
      userId,
      completedAt: { gte: since },
    },
    select: {
      activityId: true,
    },
  });

  const completionScore = new Map<string, number>();
  for (const item of recentCompletions) {
    const current = completionScore.get(item.activityId) ?? 0;
    completionScore.set(item.activityId, current + 1);
  }

  return { feedbackScore, completionScore };
}

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

  const emotionScores = collectEmotionScores(journals);
  const metrics = buildDailyMetrics(emotionScores);

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
  const primaryEmotion = emotionPriority[0].key as PriorityEmotionKey;
  const fallbackEmotion =
    (emotionPriority[1]?.key as PriorityEmotionKey | undefined) ??
    primaryEmotion;

  const feedbackWindowStart = new Date();
  feedbackWindowStart.setDate(feedbackWindowStart.getDate() - 28);
  const {
    feedbackScore: activityFeedbackScore,
    completionScore: activityCompletionScore,
  } = await loadActivityHistoryScores(user.id, feedbackWindowStart);

  const candidateTemplates = resolveTemplatesForEmotion(
    primaryEmotion,
    fallbackEmotion,
  );

  await prisma.recommendation.deleteMany({
    where: {
      userId: user.id,
      dailyTrendId: dailyTrend.id,
    },
  });

  const llmRecommendations = await generateLlmRecommendations({
    primaryEmotion,
    fallbackEmotion,
    metrics,
    templates: candidateTemplates.map((template) => ({
      templateId: template.templateId,
      activityName: template.activityName,
      intensity: template.activityIntensity,
      durationMin: template.activityDurationMin,
      category: template.category,
      targetEmotions: template.targetEmotions,
      contraindications: template.contraindications,
    })),
  });

  const selectedRecommendations = pickUniqueRecommendations(
    llmRecommendations,
    candidateTemplates,
  );
  if (!selectedRecommendations.length) {
    throw new LlmRecommendationError(
      "llm_response_invalid",
      "LLM output did not match available recommendation templates",
    );
  }

  const expiresAt = new Date(dayEnd);
  const createdRecommendations = [];

  for (const [index, selected] of selectedRecommendations.entries()) {
    const activity = selected.template;
    const llm = selected.llm;
    const feedbackScore = activityFeedbackScore.get(activity.templateId) ?? 0;
    const completionScore =
      activityCompletionScore.get(activity.templateId) ?? 0;
    const confidence = clamp01(
      emotionPriority[0].score -
        index * 0.08 +
        (0.5 - Math.min(metrics.volatility, 0.5)) * 0.1 +
        feedbackScore * 0.04 +
        completionScore * 0.03 +
        (llm?.confidenceBoost ?? 0),
    );

    const recommendation = await prisma.recommendation.create({
      data: {
        userId: user.id,
        dailyTrendId: dailyTrend.id,
        activityId: activity.templateId,
        activityName: activity.activityName,
        activityDurationMin: activity.activityDurationMin,
        activityIntensity: activity.activityIntensity,
        rationale: llm.rationale,
        confidence,
        expectedImpactMetric: llm.expectedImpactMetric ?? primaryEmotion,
        expectedImpactDelta:
          llm.expectedImpactDelta ?? Number((confidence * 0.25).toFixed(3)),
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
