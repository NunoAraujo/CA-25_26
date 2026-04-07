import axios from "axios";
import { DailyMetrics } from "./recommendationAnalytics";

type LlmActivityInput = {
  activityId: string;
  activityName: string;
  intensity: string;
  durationMin: number;
  targetEmotions: string[];
};

export type LlmActivityOutput = {
  activityId: string;
  rationale: string;
  expectedImpactMetric?: string;
  expectedImpactDelta?: number;
  confidenceBoost?: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOutput(payload: unknown): LlmActivityOutput[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): LlmActivityOutput | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const activityId = stringValue(raw.activityId);
      const rationale = stringValue(raw.rationale);

      if (!activityId || !rationale) {
        return null;
      }

      const expectedImpactMetric =
        typeof raw.expectedImpactMetric === "string"
          ? raw.expectedImpactMetric
          : undefined;

      const expectedImpactDelta =
        typeof raw.expectedImpactDelta === "number"
          ? clamp01(raw.expectedImpactDelta)
          : undefined;

      const confidenceBoost =
        typeof raw.confidenceBoost === "number"
          ? clamp01(raw.confidenceBoost)
          : undefined;

      return {
        activityId,
        rationale,
        expectedImpactMetric,
        expectedImpactDelta,
        confidenceBoost,
      };
    })
    .filter((item): item is LlmActivityOutput => item !== null);
}

export async function generateLlmRecommendationEnhancements(input: {
  primaryEmotion: string;
  fallbackEmotion: string;
  metrics: DailyMetrics;
  activities: LlmActivityInput[];
}): Promise<Map<string, LlmActivityOutput>> {
  const modelId =
    process.env.HF_TEXT_GEN_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";
  const token = process.env.HF_API_TOKEN;

  if (!token || !input.activities.length) {
    return new Map();
  }

  const endpoint =
    process.env.HF_INFERENCE_URL ??
    `https://api-inference.huggingface.co/models/${modelId}`;

  const prompt = [
    "You are an affective computing wellbeing assistant.",
    "Return only JSON (array).",
    "For each activity create one concise rationale in Portuguese (PT-PT/PT-BR neutral) based on emotion scores.",
    "JSON item keys: activityId, rationale, expectedImpactMetric, expectedImpactDelta, confidenceBoost.",
    `Primary emotion: ${input.primaryEmotion}`,
    `Secondary emotion: ${input.fallbackEmotion}`,
    `Metrics: joy=${input.metrics.joyAvg.toFixed(3)}, sadness=${input.metrics.sadnessAvg.toFixed(3)}, anger=${input.metrics.angerAvg.toFixed(3)}, anxiety=${input.metrics.anxietyAvg.toFixed(3)}, calm=${input.metrics.calmAvg.toFixed(3)}, energy=${input.metrics.energyAvg.toFixed(3)}.`,
    `Activities: ${JSON.stringify(input.activities)}.`,
    "expectedImpactDelta and confidenceBoost must be numbers from 0 to 1.",
  ].join("\n");

  try {
    const response = await axios.post(
      endpoint,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 450,
          return_full_text: false,
          temperature: 0.4,
        },
      },
      {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const rawData = response.data;
    let generatedText = "";

    if (Array.isArray(rawData)) {
      generatedText = stringValue(rawData[0]?.generated_text);
    } else if (rawData && typeof rawData === "object") {
      generatedText = stringValue(
        (rawData as { generated_text?: unknown }).generated_text,
      );
    }

    const jsonText = extractFirstJsonArray(generatedText);
    if (!jsonText) {
      return new Map();
    }

    const parsed = JSON.parse(jsonText);
    const normalized = normalizeOutput(parsed);

    return new Map(normalized.map((item) => [item.activityId, item]));
  } catch {
    return new Map();
  }
}
