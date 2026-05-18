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
  FreeformRecommendation,
} from "./llmRecommendationService";

// ─── Fallback pool ────────────────────────────────────────────────────────────
// Used ONLY when the LLM is unavailable. Broad enough to cover all emotions
// with varied categories. The LLM normally invents its own activities freely.

type FallbackEntry = {
  activityName: string;
  activityDurationMin: number;
  activityIntensity: ActivityIntensity;
  category: string;
  targetEmotions: EmotionKey[];
  rationale: Record<EmotionKey | "default", string[]>;
};

const FALLBACK_POOL: FallbackEntry[] = [
  {
    activityName: "Respiração Ritmada 4-4-4-4",
    activityDurationMin: 5,
    activityIntensity: ActivityIntensity.low,
    category: "breathing",
    targetEmotions: ["fear", "anger"],
    rationale: {
      fear: ["Quando o medo aperta, respirar de forma compassada diz ao sistema nervoso que estás seguro."],
      anger: ["Pausas rítmicas interrompem o ciclo de raiva antes de chegar ao limite."],
      sadness: ["Uma respiração lenta e profunda é o regulador mais acessível que tens."],
      disgust: ["Centrar a atenção na respiração desvia o foco da fonte de aversão."],
      surprise: ["Respirar com calma ajuda a integrar acontecimentos inesperados."],
      joy: ["Respirar com consciência amplifica e prolonga a sensação de bem-estar."],
      default: ["Uma respiração lenta e compassada é o regulador emocional mais acessível que tens."],
    },
  },
  {
    activityName: "Body Scan de 10 Minutos",
    activityDurationMin: 10,
    activityIntensity: ActivityIntensity.low,
    category: "mindfulness",
    targetEmotions: ["sadness", "fear"],
    rationale: {
      sadness: ["A tristeza guarda-se frequentemente no corpo antes de chegar à consciência. Um body scan ajuda a localizar e soltar essa tensão."],
      fear: ["Ancorar a atenção nas sensações físicas desativa a ruminação ansiosa."],
      anger: ["Percorrer o corpo com atenção suave permite identificar onde a raiva está instalada."],
      disgust: ["Fazer check-in com o corpo sem julgamento recentra a atenção no momento presente."],
      surprise: ["Um body scan ajuda a processar a ativação fisiológica causada por acontecimentos inesperados."],
      joy: ["Sentir o bem-estar no corpo e reconhecê-lo prolonga o seu efeito."],
      default: ["O body scan é uma forma de fazer check-in contigo mesmo — sem julgamento, apenas observação."],
    },
  },
  {
    activityName: "Caminhada Consciente ao Ar Livre",
    activityDurationMin: 15,
    activityIntensity: ActivityIntensity.medium,
    category: "movement",
    targetEmotions: ["sadness", "anger"],
    rationale: {
      sadness: ["O movimento moderado aumenta a serotonina e a dopamina — mesmo 15 minutos têm impacto mensurável no humor."],
      anger: ["Dissipar a raiva com movimento físico e ar fresco liberta a energia acumulada de forma saudável."],
      fear: ["Mudar de ambiente físico quebra o ciclo de ruminação ansiosa."],
      disgust: ["Sair do espaço associado à fonte de aversão ajuda a criar distância emocional."],
      surprise: ["Uma caminhada sem destino certo é uma forma de processar acontecimentos inesperados."],
      joy: ["Partilhar a alegria com o exterior amplifica o estado positivo."],
      default: ["Mover o corpo é mover as emoções. 15 minutos são suficientes para mudar o estado interno."],
    },
  },
  {
    activityName: "Diário de Emoções Livre",
    activityDurationMin: 10,
    activityIntensity: ActivityIntensity.low,
    category: "journaling",
    targetEmotions: ["sadness", "anger", "disgust"],
    rationale: {
      sadness: ["Escrever livremente sobre o que sentes pode revelar padrões emocionais invisíveis ao pensamento."],
      anger: ["Escrever a raiva em vez de a expressar impulsivamente é uma forma de processar sem consequências."],
      disgust: ["Nomear e externalizar a aversão em palavras escritas reduz a sua intensidade."],
      fear: ["Escrever os medos concretos ajuda a avaliá-los de forma mais racional."],
      surprise: ["Registar por escrito o acontecimento inesperado ajuda a integrá-lo e dar-lhe sentido."],
      joy: ["Escrever sobre o que correu bem consolida a memória positiva."],
      default: ["10 minutos de diário livre ajudam a clarificar o que está a acontecer contigo."],
    },
  },
  {
    activityName: "Lista de Gratidão (3 itens concretos)",
    activityDurationMin: 5,
    activityIntensity: ActivityIntensity.low,
    category: "cognitive",
    targetEmotions: ["sadness", "disgust"],
    rationale: {
      sadness: ["Listar 3 coisas concretas pelas quais és grato ativa circuitos de bem-estar, mesmo quando a tristeza está presente."],
      disgust: ["Focar na gratidão cria contraste e equilíbrio cognitivo quando a deceção domina."],
      anger: ["Reconhecer o que ainda é bom funciona como contrapeso à irritação."],
      fear: ["Identificar recursos e apoios concretos reduz a sensação de vulnerabilidade."],
      surprise: ["Reconhecer o que permanece estável ajuda a integrar a mudança inesperada."],
      joy: ["Aprofundar e articular a gratidão consolida e intensifica os estados positivos."],
      default: ["A prática de gratidão funciona melhor quando é específica e genuína."],
    },
  },
];

// ─── Fallback builder ─────────────────────────────────────────────────────────

function pickRationale(entry: FallbackEntry, emotion: EmotionKey): string {
  const pool =
    entry.rationale[emotion] ?? entry.rationale["default"] ?? ["Atividade recomendada com base no teu perfil emocional de hoje."];
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildFallbackRecommendations(
  primaryEmotion: EmotionKey,
): FreeformRecommendation[] {
  // Sort pool: entries targeting primary emotion first
  const sorted = [...FALLBACK_POOL].sort((a, b) => {
    const aTargets = a.targetEmotions.includes(primaryEmotion) ? 1 : 0;
    const bTargets = b.targetEmotions.includes(primaryEmotion) ? 1 : 0;
    return bTargets - aTargets;
  });

  return sorted.slice(0, 3).map((entry) => ({
    activityName: entry.activityName,
    activityDurationMin: entry.activityDurationMin,
    activityIntensity: entry.activityIntensity as "low" | "medium" | "high",
    category: entry.category,
    rationale: pickRationale(entry, primaryEmotion),
    expectedImpactMetric: primaryEmotion,
    expectedImpactDelta: 0.12,
    confidenceBoost: 0,
  }));
}

// ─── Journal helpers ──────────────────────────────────────────────────────────

type JournalSample = {
  joyScore: number | null;
  sadnessScore: number | null;
  angerScore: number | null;
  fearScore: number | null;
  disgustScore: number | null;
  surpriseScore: number | null;
  transcription: string | null;
};

function collectEmotionScores(journals: JournalSample[]) {
  const scores: Record<EmotionKey, number[]> = {
    joy: [], sadness: [], anger: [], fear: [], disgust: [], surprise: [],
  };
  for (const j of journals) {
    if (typeof j.joyScore === "number") scores.joy.push(j.joyScore);
    if (typeof j.sadnessScore === "number") scores.sadness.push(j.sadnessScore);
    if (typeof j.angerScore === "number") scores.anger.push(j.angerScore);
    if (typeof j.fearScore === "number") scores.fear.push(j.fearScore);
    if (typeof j.disgustScore === "number") scores.disgust.push(j.disgustScore);
    if (typeof j.surpriseScore === "number") scores.surprise.push(j.surpriseScore);
  }
  return scores;
}

// Loads the names of activities suggested in the last N days (for exclusion)
async function loadRecentActivityNames(
  userId: string,
  lookbackDays = 3,
): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const recs = await prisma.recommendation.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { activityName: true },
  });

  return [...new Set(recs.map((r) => r.activityName))];
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  // Load today's completed journals
  const journals = await prisma.journal.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: "complete",
      uploadedAt: { gte: dayStart, lt: dayEnd },
    },
    select: {
      joyScore: true, sadnessScore: true, angerScore: true,
      fearScore: true, disgustScore: true, surpriseScore: true,
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

  // Build emotion metrics
  const emotionScores = collectEmotionScores(journals);
  const metrics = buildDailyMetrics(emotionScores);

  // Upsert daily trend
  const dailyTrend = await prisma.dailyTrend.upsert({
    where: { userId_dayStart: { userId: user.id, dayStart } },
    create: {
      userId: user.id, dayStart, dayEnd,
      avgJoyScore: metrics.joyAvg, avgSadnessScore: metrics.sadnessAvg,
      avgAngerScore: metrics.angerAvg, avgFearScore: metrics.fearAvg,
      avgDisgustScore: metrics.disgustAvg, avgSurpriseScore: metrics.surpriseAvg,
      joyTrend: metrics.joyAvg, sadnessTrend: metrics.sadnessAvg,
      angerTrend: metrics.angerAvg, fearTrend: metrics.fearAvg,
      disgustTrend: metrics.disgustAvg, surpriseTrend: metrics.surpriseAvg,
      emotionalVolatility: metrics.volatility,
      entryCount: journals.length, completionRate: 1,
    },
    update: {
      dayEnd,
      avgJoyScore: metrics.joyAvg, avgSadnessScore: metrics.sadnessAvg,
      avgAngerScore: metrics.angerAvg, avgFearScore: metrics.fearAvg,
      avgDisgustScore: metrics.disgustAvg, avgSurpriseScore: metrics.surpriseAvg,
      joyTrend: metrics.joyAvg, sadnessTrend: metrics.sadnessAvg,
      angerTrend: metrics.angerAvg, fearTrend: metrics.fearAvg,
      disgustTrend: metrics.disgustAvg, surpriseTrend: metrics.surpriseAvg,
      emotionalVolatility: metrics.volatility,
      entryCount: journals.length, completionRate: 1,
    },
  });

  const emotionPriority = computeEmotionPriority(metrics);
  const primaryEmotion = emotionPriority[0].key as EmotionKey;
  const fallbackEmotion = (emotionPriority[1]?.key as EmotionKey | undefined) ?? primaryEmotion;

  // Context for the LLM: merge transcriptions, cap at 500 chars
  const transcriptionContext = journals
    .map((j) => j.transcription ?? "")
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);

  // Recent activity names → exclusion list for the LLM
  const recentActivities = await loadRecentActivityNames(user.id, 3);

  // Clear existing recommendations for this trend so we start fresh
  await prisma.recommendation.deleteMany({
    where: { userId: user.id, dailyTrendId: dailyTrend.id },
  });

  // Generate recommendations: LLM first, fallback if unavailable
  let recommendations: FreeformRecommendation[] = [];
  let llmMode: "remote" | "fallback" = "remote";
  let llmFallbackReason: string | null = null;

  try {
    recommendations = await generateLlmRecommendations({
      primaryEmotion,
      fallbackEmotion,
      metrics,
      recentActivities,
      transcriptionContext,
    });
  } catch (error) {
    if (!(error instanceof LlmRecommendationError)) throw error;
    llmMode = "fallback";
    llmFallbackReason = `${error.code}: ${error.message}`;
    recommendations = buildFallbackRecommendations(primaryEmotion);
  }

  if (!recommendations.length) {
    throw new LlmRecommendationError(
      "llm_response_invalid",
      "No valid recommendations could be generated",
    );
  }

  // Persist recommendations
  const expiresAt = new Date(dayEnd);
  const created = [];

  for (const [index, rec] of recommendations.entries()) {
    const confidence = clamp01(
      emotionPriority[0].score
      - index * 0.08
      + (0.5 - Math.min(metrics.volatility, 0.5)) * 0.1
      + rec.confidenceBoost,
    );

    const intensityMap: Record<string, ActivityIntensity> = {
      low: ActivityIntensity.low,
      medium: ActivityIntensity.medium,
      high: ActivityIntensity.high,
    };

    const saved = await prisma.recommendation.create({
      data: {
        userId: user.id,
        dailyTrendId: dailyTrend.id,
        activityId: `llm-${Date.now()}-${index}`,
        activityName: rec.activityName,
        activityDurationMin: rec.activityDurationMin,
        activityIntensity: intensityMap[rec.activityIntensity] ?? ActivityIntensity.low,
        rationale: rec.rationale,
        confidence,
        expectedImpactMetric: rec.expectedImpactMetric ?? primaryEmotion,
        expectedImpactDelta: rec.expectedImpactDelta ?? Number((confidence * 0.25).toFixed(3)),
        expiresAt,
      },
    });

    created.push(saved);
  }

  return {
    status: 201,
    payload: {
      message: "Daily recommendations generated",
      dayStart,
      dailyTrend,
      llm: {
        mode: llmMode,
        model: process.env.HF_TEXT_GEN_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3",
        fallbackReason: llmFallbackReason,
      },
      recommendations: created,
    },
  };
}

export async function listRecommendations(dayStart?: Date) {
  const effectiveDayStart = dayStart ?? startOfDayUTC(new Date());
  const effectiveDayEnd = new Date(effectiveDayStart);
  effectiveDayEnd.setUTCDate(effectiveDayEnd.getUTCDate() + 1);

  const recommendations = await prisma.recommendation.findMany({
    where: {
      dailyTrend: {
        dayStart: { gte: effectiveDayStart, lt: effectiveDayEnd },
      },
    },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
  });

  return { recommendations, total: recommendations.length };
}

export async function listAllRecommendations() {
  const recommendations = await prisma.recommendation.findMany({
    orderBy: [{ createdAt: "desc" }, { confidence: "desc" }],
    take: 100,
  });
  return { recommendations, total: recommendations.length };
}

export async function storeRecommendationFeedback(
  recommendationId: string,
  feedback: "positive" | "neutral" | "negative",
) {
  return prisma.recommendation.update({
    where: { id: recommendationId },
    data: { feedback, feedbackAt: new Date() },
  });
}

export async function storeRecommendationCompletion(
  recommendationId: string,
  completedAt?: Date,
) {
  return prisma.recommendation.update({
    where: { id: recommendationId },
    data: { completedAt: completedAt ?? new Date() },
  });
}
