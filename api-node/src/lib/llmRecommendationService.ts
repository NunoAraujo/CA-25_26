import axios from "axios";
import { DailyMetrics } from "./recommendationAnalytics";

type LlmTemplateInput = {
  templateId: string;
  activityName: string;
  intensity: string;
  durationMin: number;
  category: string;
  targetEmotions: string[];
  contraindications: string[];
};

export type LlmRecommendationOutput = {
  templateId?: string;
  rationale: string;
  expectedImpactMetric?: string;
  expectedImpactDelta?: number;
  confidenceBoost?: number;
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

function normalizeOutput(payload: unknown): LlmRecommendationOutput[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): LlmRecommendationOutput | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const templateId = stringValue(raw.templateId);
      const rationale = stringValue(raw.rationale);

      if (!rationale) {
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
        templateId: templateId || undefined,
        rationale,
        expectedImpactMetric,
        expectedImpactDelta,
        confidenceBoost,
      };
    })
    .filter((item): item is LlmRecommendationOutput => item !== null);
}

export async function generateLlmRecommendations(input: {
  primaryEmotion: string;
  fallbackEmotion: string;
  metrics: DailyMetrics;
  templates: LlmTemplateInput[];
}): Promise<LlmRecommendationOutput[]> {
  const modelId =
    process.env.HF_TEXT_GEN_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";
  const token = process.env.HF_API_TOKEN?.trim();

  if (!input.templates.length) {
    throw new LlmRecommendationError(
      "llm_response_invalid",
      "No recommendation templates available for LLM generation",
      422,
    );
  }

  const configuredEndpoint = process.env.HF_INFERENCE_URL?.trim();
  const endpoint =
    configuredEndpoint && configuredEndpoint.length
      ? configuredEndpoint
      : "https://router.huggingface.co/v1/chat/completions";

  const isChatCompletionsEndpoint = endpoint.includes("/v1/chat/completions");

  const usingHuggingFaceHostedEndpoint =
    endpoint.includes("router.huggingface.co") ||
    endpoint.includes("api-inference.huggingface.co");

  if (usingHuggingFaceHostedEndpoint && !token) {
    throw new LlmRecommendationError(
      "llm_config_missing",
      "HF_API_TOKEN is required when using Hugging Face hosted inference",
    );
  }

  const prompt = [
    "You are an affective computing wellbeing assistant.",
    "Return only JSON (array).",
    "Generate exactly 3 recommendation items in Portuguese (PT-PT/PT-BR neutral) from the provided templates.",
    "Each item must contain keys: templateId, rationale, expectedImpactMetric, expectedImpactDelta, confidenceBoost.",
    "Use templateId values exactly as provided in the template list.",
    `Primary emotion: ${input.primaryEmotion}`,
    `Secondary emotion: ${input.fallbackEmotion}`,
    `Metrics: joy=${input.metrics.joyAvg.toFixed(3)}, sadness=${input.metrics.sadnessAvg.toFixed(3)}, anger=${input.metrics.angerAvg.toFixed(3)}, anxiety=${input.metrics.anxietyAvg.toFixed(3)}, calm=${input.metrics.calmAvg.toFixed(3)}, energy=${input.metrics.energyAvg.toFixed(3)}.`,
    `Templates: ${JSON.stringify(input.templates)}.`,
    "expectedImpactDelta and confidenceBoost must be numbers from 0 to 1.",
  ].join("\n");

  try {
    const requestPayload = isChatCompletionsEndpoint
      ? {
          model: modelId,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.4,
        }
      : {
          inputs: prompt,
          parameters: {
            max_new_tokens: 450,
            return_full_text: false,
            temperature: 0.4,
          },
        };

    const response = await axios.post(
      endpoint,
      requestPayload,
      {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );

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
    const normalized = normalizeOutput(parsed);
    if (!normalized.length) {
      throw new LlmRecommendationError(
        "llm_response_invalid",
        "LLM response did not include valid recommendation items",
      );
    }

    return normalized;
  } catch (error) {
    if (error instanceof LlmRecommendationError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as { response?: { data?: unknown } };
      const providerPayload = axiosError.response?.data;
      let providerMessage = "";

      if (typeof providerPayload === "string") {
        providerMessage = providerPayload;
      } else if (providerPayload && typeof providerPayload === "object") {
        const recordPayload = providerPayload as Record<string, unknown>;
        if (typeof recordPayload.error === "string") {
          providerMessage = recordPayload.error;
        } else if (
          recordPayload.error &&
          typeof recordPayload.error === "object" &&
          typeof (recordPayload.error as Record<string, unknown>).message ===
            "string"
        ) {
          providerMessage = String(
            (recordPayload.error as Record<string, unknown>).message,
          );
        } else if (typeof recordPayload.message === "string") {
          providerMessage = recordPayload.message;
        }
      }

      const normalizedProviderMessage = providerMessage.trim();
      throw new LlmRecommendationError(
        "llm_request_failed",
        normalizedProviderMessage
          ? `Failed to generate recommendations from LLM: ${normalizedProviderMessage}`
          : "Failed to generate recommendations from LLM",
      );
    }

    throw new LlmRecommendationError(
      "llm_request_failed",
      "Failed to generate recommendations from LLM",
    );
  }
}
