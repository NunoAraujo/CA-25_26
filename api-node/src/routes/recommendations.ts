import { NextFunction, Request, Response, Router } from "express";
import Joi from "joi";
import { prisma } from "../lib/prisma";
import { getOrCreateDefaultUser } from "../lib/defaultUser";

const router = Router();

const feedbackSchema = Joi.object({
  feedback: Joi.string().valid("positive", "neutral", "negative").required(),
});

const generateSchema = Joi.object({
  weekStart: Joi.date().iso().optional(),
});

type EmotionKey = "joy" | "sadness" | "anger" | "anxiety" | "calm" | "energy";

function startOfWeekUTC(date: Date) {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utcDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + offset);
  return utcDate;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function recommendationRationale(targetEmotion: string) {
  if (targetEmotion === "anxiety") {
    return "Niveis de ansiedade elevados na semana; atividade sugerida para regulacao fisiologica.";
  }
  if (targetEmotion === "sadness") {
    return "Indicadores de tristeza persistente; atividade sugerida para reconectar com energia e presenca.";
  }
  if (targetEmotion === "anger") {
    return "Sinais de irritabilidade/raiva acima do baseline; atividade sugerida para desaceleracao e clareza.";
  }
  if (targetEmotion === "low_energy") {
    return "Energia semanal abaixo do ideal; atividade sugerida para reativacao gradual.";
  }

  return "Atividade sugerida com base no padrao emocional semanal detectado.";
}

router.post(
  "/generate-weekly",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = generateSchema.validate(req.body ?? {}, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          message: "Invalid generation payload",
          details: error.details,
        });
      }

      const user = await getOrCreateDefaultUser();
      const weekStart = value.weekStart
        ? startOfWeekUTC(new Date(String(value.weekStart)))
        : startOfWeekUTC(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

      const journals = await prisma.journal.findMany({
        where: {
          userId: user.id,
          deletedAt: null,
          status: "complete",
          uploadedAt: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
        select: {
          joyScore: true,
          sadnessScore: true,
          angerScore: true,
          anxietyScore: true,
          calmScore: true,
          energyScore: true,
        },
      });

      if (!journals.length) {
        return res.status(200).json({
          message: "No completed journals found for requested week",
          weekStart,
          created: 0,
        });
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

      const joyAvg = average(emotionScores.joy);
      const sadnessAvg = average(emotionScores.sadness);
      const angerAvg = average(emotionScores.anger);
      const anxietyAvg = average(emotionScores.anxiety);
      const calmAvg = average(emotionScores.calm);
      const energyAvg = average(emotionScores.energy);

      const volatility = stdDev([
        ...emotionScores.joy,
        ...emotionScores.sadness,
        ...emotionScores.anger,
        ...emotionScores.anxiety,
        ...emotionScores.calm,
        ...emotionScores.energy,
      ]);

      const weeklyTrend = await prisma.weeklyTrend.upsert({
        where: {
          userId_weekStart: {
            userId: user.id,
            weekStart,
          },
        },
        create: {
          userId: user.id,
          weekStart,
          weekEnd,
          avgJoyScore: joyAvg,
          avgSadnessScore: sadnessAvg,
          avgAngerScore: angerAvg,
          avgAnxietyScore: anxietyAvg,
          avgCalmScore: calmAvg,
          avgEnergyScore: energyAvg,
          joyTrend: joyAvg,
          sadnessTrend: sadnessAvg,
          angerTrend: angerAvg,
          anxietyTrend: anxietyAvg,
          calmTrend: calmAvg,
          energyTrend: energyAvg,
          emotionalVolatility: volatility,
          entryCount: journals.length,
          completionRate: 1,
        },
        update: {
          weekEnd,
          avgJoyScore: joyAvg,
          avgSadnessScore: sadnessAvg,
          avgAngerScore: angerAvg,
          avgAnxietyScore: anxietyAvg,
          avgCalmScore: calmAvg,
          avgEnergyScore: energyAvg,
          joyTrend: joyAvg,
          sadnessTrend: sadnessAvg,
          angerTrend: angerAvg,
          anxietyTrend: anxietyAvg,
          calmTrend: calmAvg,
          energyTrend: energyAvg,
          emotionalVolatility: volatility,
          entryCount: journals.length,
          completionRate: 1,
        },
      });

      const emotionPriority: Array<{ key: string; score: number }> = [
        { key: "anxiety", score: anxietyAvg },
        { key: "sadness", score: sadnessAvg },
        { key: "anger", score: angerAvg },
        { key: "low_energy", score: 1 - energyAvg },
      ]
        .filter((item) => item.score > 0.35)
        .sort((a, b) => b.score - a.score);

      if (!emotionPriority.length) {
        emotionPriority.push({ key: "anxiety", score: 0.4 });
      }

      const primaryEmotion = emotionPriority[0].key;
      const fallbackEmotion = emotionPriority[1]?.key ?? primaryEmotion;

      const activities = await prisma.activityLibrary.findMany({
        where: {
          targetEmotions: {
            hasSome: [primaryEmotion, fallbackEmotion],
          },
        },
        orderBy: [{ intensity: "asc" }, { durationMin: "asc" }],
        take: 3,
      });

      if (!activities.length) {
        return res.status(200).json({
          message: "No matching activities found in library",
          weekStart,
          weeklyTrendId: weeklyTrend.id,
          created: 0,
        });
      }

      await prisma.recommendation.deleteMany({
        where: {
          userId: user.id,
          weeklyTrendId: weeklyTrend.id,
        },
      });

      const expiresAt = new Date(weekEnd);
      const createdRecommendations = [];

      for (const [index, activity] of activities.entries()) {
        const confidence = clamp01(
          emotionPriority[0].score -
            index * 0.08 +
            (0.5 - Math.min(volatility, 0.5)) * 0.1,
        );

        const recommendation = await prisma.recommendation.create({
          data: {
            userId: user.id,
            weeklyTrendId: weeklyTrend.id,
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

      return res.status(201).json({
        message: "Weekly recommendations generated",
        weekStart,
        weeklyTrend,
        recommendations: createdRecommendations,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const weekStartRaw = req.query.weekStart;
    const weekStart =
      typeof weekStartRaw === "string" ? new Date(weekStartRaw) : undefined;

    const recommendations = await prisma.recommendation.findMany({
      where: {
        ...(weekStart
          ? {
              weeklyTrend: {
                weekStart,
              },
            }
          : {}),
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    });

    res.json({ recommendations, total: recommendations.length });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:recommendationId/feedback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recommendationId = String(req.params.recommendationId);
      const { error, value } = feedbackSchema.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          message: "Invalid feedback payload",
          details: error.details,
        });
      }

      const recommendation = await prisma.recommendation.update({
        where: { id: recommendationId },
        data: {
          feedback: value.feedback,
          feedbackAt: new Date(),
        },
      });

      return res.json({ message: "Feedback stored", recommendation });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
