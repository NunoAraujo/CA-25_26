export type EmotionKey =
  | "joy"
  | "sadness"
  | "anger"
  | "fear"
  | "disgust"
  | "surprise";

export type DailyMetrics = {
  joyAvg: number;
  sadnessAvg: number;
  angerAvg: number;
  fearAvg: number;
  disgustAvg: number;
  surpriseAvg: number;
  volatility: number;
};

export function startOfDayUTC(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stdDev(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function recommendationRationale(targetEmotion: string) {
  if (targetEmotion === "fear") {
    return "Indicadores de medo elevados no dia; atividade sugerida para regulacao e sensacao de seguranca.";
  }
  if (targetEmotion === "sadness") {
    return "Indicadores de tristeza persistente; atividade sugerida para reconectar com presenca e vitalidade.";
  }
  if (targetEmotion === "anger") {
    return "Sinais de irritabilidade/raiva acima do baseline; atividade sugerida para desaceleracao e clareza.";
  }
  if (targetEmotion === "disgust") {
    return "Sinais de aversao/rejeicao elevados; atividade sugerida para recentrar a atencao e reduzir reatividade.";
  }
  if (targetEmotion === "surprise") {
    return "Sinais de surpresa/ativacao elevados; atividade sugerida para integrar a experiencia e estabilizar o ritmo.";
  }

  return "Atividade sugerida com base no padrao emocional diario detetado.";
}

export function buildDailyMetrics(
  emotionScores: Record<EmotionKey, number[]>,
): DailyMetrics {
  const joyAvg = average(emotionScores.joy);
  const sadnessAvg = average(emotionScores.sadness);
  const angerAvg = average(emotionScores.anger);
  const fearAvg = average(emotionScores.fear);
  const disgustAvg = average(emotionScores.disgust);
  const surpriseAvg = average(emotionScores.surprise);

  const volatility = stdDev([
    ...emotionScores.joy,
    ...emotionScores.sadness,
    ...emotionScores.anger,
    ...emotionScores.fear,
    ...emotionScores.disgust,
    ...emotionScores.surprise,
  ]);

  return {
    joyAvg,
    sadnessAvg,
    angerAvg,
    fearAvg,
    disgustAvg,
    surpriseAvg,
    volatility,
  };
}

export function inferContraindications(transcriptions: string[]) {
  const text = transcriptions.join(" ").toLowerCase();
  const signals: string[] = [];

  if (
    text.includes("falta de ar") ||
    text.includes("respirar mal") ||
    text.includes("tontura")
  ) {
    signals.push("desconforto respiratorio agudo", "hiperventilacao");
  }

  if (
    text.includes("dor forte") ||
    text.includes("dor intensa") ||
    text.includes("dor no peito")
  ) {
    signals.push("dor intensa sem acompanhamento medico");
  }

  if (
    text.includes("lesao") ||
    text.includes("tornozelo") ||
    text.includes("joelho") ||
    text.includes("lombar")
  ) {
    signals.push("lesao ortopedica sem liberacao");
  }

  return Array.from(new Set(signals));
}

export function computeEmotionPriority(metrics: DailyMetrics) {
  const items = [
    { key: "fear", score: metrics.fearAvg },
    { key: "sadness", score: metrics.sadnessAvg },
    { key: "anger", score: metrics.angerAvg },
    { key: "disgust", score: metrics.disgustAvg },
    { key: "surprise", score: metrics.surpriseAvg },
    { key: "joy", score: metrics.joyAvg },
  ]
    .filter((item) => item.score > 0.35)
    .sort((a, b) => b.score - a.score);

  if (!items.length) {
    items.push({ key: "joy", score: metrics.joyAvg });
  }

  return items;
}
