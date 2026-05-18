import axios from "axios";
import { DailyMetrics } from "./recommendationAnalytics";

export type FreeformRecommendation = {
  activityName: string;
  activityDurationMin: number;
  activityIntensity: "low" | "medium" | "high";
  category: string;
  rationale: string;
  expectedImpactMetric: string;
  expectedImpactDelta: number;
  confidenceBoost: number;
};

export class LlmRecommendationError extends Error {
  readonly code:
    | "llm_config_missing"
    | "llm_response_invalid"
    | "llm_request_failed";
  readonly statusCode: number;

  constructor(
    code: "llm_config_missing" | "llm_response_invalid" | "llm_request_failed",
    message: string,
    statusCode = 503,
  ) {
    super(message);
    this.name = "LlmRecommendationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Keep the old type alias for backward compatibility
export type LlmRecommendationOutput = FreeformRecommendation;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOutput(
  payload: unknown,
  recentActivities: string[],
): FreeformRecommendation[] {
  if (!Array.isArray(payload)) return [];

  const results: FreeformRecommendation[] = [];

  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;

    const activityName = stringValue(raw.activityName);
    const rationale = stringValue(raw.rationale);
    if (!activityName || !rationale) continue;

    // Deduplicate against recently done activities (case-insensitive)
    const alreadyDone = recentActivities.some(
      (a) => a.toLowerCase() === activityName.toLowerCase(),
    );
    if (alreadyDone) continue;

    const activityDurationMin =
      typeof raw.activityDurationMin === "number" && raw.activityDurationMin > 0
        ? raw.activityDurationMin
        : 10;

    const rawIntensity = stringValue(raw.activityIntensity).toLowerCase();
    const activityIntensity: "low" | "medium" | "high" =
      rawIntensity === "high"
        ? "high"
        : rawIntensity === "medium"
          ? "medium"
          : "low";

    const category = stringValue(raw.category) || "wellbeing";

    const expectedImpactMetric =
      typeof raw.expectedImpactMetric === "string"
        ? raw.expectedImpactMetric
        : "general";

    const expectedImpactDelta =
      typeof raw.expectedImpactDelta === "number"
        ? clamp01(raw.expectedImpactDelta)
        : 0.15;

    const confidenceBoost =
      typeof raw.confidenceBoost === "number"
        ? clamp01(raw.confidenceBoost)
        : 0;

    results.push({
      activityName,
      activityDurationMin,
      activityIntensity,
      category,
      rationale,
      expectedImpactMetric,
      expectedImpactDelta,
      confidenceBoost,
    });

    if (results.length >= 3) break;
  }

  return results;
}

function buildSystemPrompt(
  metrics: DailyMetrics,
  primaryEmotion: string,
  fallbackEmotion: string,
  recentActivities: string[],
  transcriptionContext: string,
): string {
  const lines = [
    "You are a compassionate wellbeing assistant specialised in affective computing.",
    "Your task: generate exactly 3 personalised wellbeing activity recommendations in European Portuguese (PT-PT).",
    "",
    "Rules:",
    "- Return ONLY a valid JSON array with exactly 3 objects. No explanations, no markdown.",
    "- Each object must have these exact keys:",
    '  activityName (string), activityDurationMin (number), activityIntensity ("low"|"medium"|"high"),',
    "  category (string), rationale (string), expectedImpactMetric (string), expectedImpactDelta (0-1), confidenceBoost (0-1)",
    "- rationale must be 1-2 sentences in PT-PT explaining WHY this specific activity helps given today's emotional state.",
    "- activityName must be creative and specific — never repeat an activity from the exclusion list.",
    "- Activities should vary across categories (e.g. one physical, one cognitive, one creative).",
    "- Duration: low intensity → 5-15 min; medium → 10-25 min; high → 20-45 min.",
    "",
    `Primary emotion today: ${primaryEmotion} (score: ${getPrimaryScore(metrics, primaryEmotion).toFixed(2)})`,
    `Secondary emotion: ${fallbackEmotion}`,
    `Full emotional profile: joy=${metrics.joyAvg.toFixed(2)}, sadness=${metrics.sadnessAvg.toFixed(2)}, anger=${metrics.angerAvg.toFixed(2)}, fear=${metrics.fearAvg.toFixed(2)}, disgust=${metrics.disgustAvg.toFixed(2)}, surprise=${metrics.surpriseAvg.toFixed(2)}`,
    `Emotional volatility (0=stable, 1=very volatile): ${metrics.volatility.toFixed(2)}`,
  ];

  if (transcriptionContext.trim().length > 20) {
    lines.push(``, `Context from today's journal entry: "${transcriptionContext.slice(0, 300)}"`);
  }

  if (recentActivities.length > 0) {
    lines.push(``, `Exclusion list (already suggested recently — DO NOT repeat): ${recentActivities.join(", ")}`);
  }

  lines.push(
    ``,
    `Now generate the JSON array of 3 wellbeing recommendations tailored to this person's emotional state:`,
  );

  return lines.join("\n");
}

function getPrimaryScore(metrics: DailyMetrics, emotion: string): number {
  const map: Record<string, number> = {
    joy: metrics.joyAvg,
    sadness: metrics.sadnessAvg,
    anger: metrics.angerAvg,
    fear: metrics.fearAvg,
    disgust: metrics.disgustAvg,
    surprise: metrics.surpriseAvg,
  };
  return map[emotion] ?? 0;
}

export async function generateLlmRecommendations(input: {
  primaryEmotion: string;
  fallbackEmotion: string;
  metrics: DailyMetrics;
  recentActivities?: string[];
  transcriptionContext?: string;
}): Promise<FreeformRecommendation[]> {
  const modelId =
    process.env.HF_TEXT_GEN_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";
  const token = process.env.HF_API_TOKEN?.trim();

  const configuredEndpoint = process.env.HF_INFERENCE_URL?.trim();
  const endpoint =
    configuredEndpoint?.length
      ? configuredEndpoint
      : "https://router.huggingface.co/v1/chat/completions";

  const isChatEndpoint = endpoint.includes("/v1/chat/completions");
  const isHuggingFaceHosted =
    endpoint.includes("router.huggingface.co") ||
    endpoint.includes("api-inference.huggingface.co");

  if (isHuggingFaceHosted && !token) {
    throw new LlmRecommendationError(
      "llm_config_missing",
      "HF_API_TOKEN is required when using Hugging Face hosted inference",
    );
  }

  const recentActivities = input.recentActivities ?? [];
  const transcriptionContext = input.transcriptionContext ?? "";

  const prompt = buildSystemPrompt(
    input.metrics,
    input.primaryEmotion,
    input.fallbackEmotion,
    recentActivities,
    transcriptionContext,
  );

  try {
    const requestPayload = isChatEndpoint
      ? {
          model: modelId,
          messages: [
            {
              role: "system",
              content:
                "You are a wellbeing assistant. Return only valid JSON arrays. No markdown, no prose.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 800,
          temperature: 0.75,
        }
      : {
          inputs: prompt,
          parameters: {
            max_new_tokens: 750,
            return_full_text: false,
            temperature: 0.75,
          },
        };

    const response = await axios.post(endpoint, requestPayload, {
      timeout: 25000,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const rawData = response.data;
    let generatedText = "";

    if (Array.isArray(rawData)) {
      generatedText = stringValue(rawData[0]?.generated_text);
    } else if (rawData && typeof rawData === "object") {
      const typed = rawData as {
        generated_text?: unknown;
        choices?: Array<{ text?: unknown; message?: { content?: unknown } }>;
      };
      if (Array.isArray(typed.choices) && typed.choices.length > 0) {
        generatedText = stringValue(
          typed.choices[0]?.message?.content ?? typed.choices[0]?.text,
        );
      }
      if (!generatedText) {
        generatedText = stringValue(typed.generated_text);
      }
    }

    const jsonText = extractFirstJsonArray(generatedText);
    if (!jsonText) {
      throw new LlmRecommendationError(
        "llm_response_invalid",
        "LLM response did not contain a valid JSON array",
      );
    }

    const parsed = JSON.parse(jsonText);
    const normalized = normalizeOutput(parsed, recentActivities);

    if (!normalized.length) {
      throw new LlmRecommendationError(
        "llm_response_invalid",
        "LLM response did not include valid recommendation items",
      );
    }

    return normalized;
  } catch (error) {
    if (error instanceof LlmRecommendationError) throw error;

    if (axios.isAxiosError(error)) {
      const payload = (error as { response?: { data?: unknown } }).response
        ?.data;
      let msg = "";
      if (typeof payload === "string") {
        msg = payload;
      } else if (payload && typeof payload === "object") {
        const r = payload as Record<string, unknown>;
        msg =
          typeof r.error === "string"
            ? r.error
            : typeof r.message === "string"
              ? r.message
              : "";
      }
      throw new LlmRecommendationError(
        "llm_request_failed",
        msg
          ? `Failed to generate recommendations: ${msg}`
          : "Failed to generate recommendations from LLM",
      );
    }

    throw new LlmRecommendationError(
      "llm_request_failed",
      error instanceof Error
        ? error.message
        : "Failed to generate recommendations from LLM",
    );
  }
}
