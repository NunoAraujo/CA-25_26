export type EmotionKey =
  | "joy"
  | "sadness"
  | "anger"
  | "anxiety"
  | "calm"
  | "energy";

export type DailyMetrics = {
  joyAvg: number;
  sadnessAvg: number;
  angerAvg: number;
  anxietyAvg: number;
  calmAvg: number;
  energyAvg: number;
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
  if (targetEmotion === "anxiety") {
    return "Niveis de ansiedade elevados no dia; atividade sugerida para regulacao fisiologica.";
  }
  if (targetEmotion === "sadness") {
    return "Indicadores de tristeza persistente; atividade sugerida para reconectar com energia e presenca.";
  }
  if (targetEmotion === "anger") {
    return "Sinais de irritabilidade/raiva acima do baseline; atividade sugerida para desaceleracao e clareza.";
  }
  if (targetEmotion === "low_energy") {
    return "Energia diaria abaixo do ideal; atividade sugerida para reativacao gradual.";
  }

  return "Atividade sugerida com base no padrao emocional diario detectado.";
}

export function buildDailyMetrics(
  emotionScores: Record<EmotionKey, number[]>,
): DailyMetrics {
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

  return {
    joyAvg,
    sadnessAvg,
    angerAvg,
    anxietyAvg,
    calmAvg,
    energyAvg,
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
    { key: "anxiety", score: metrics.anxietyAvg },
    { key: "sadness", score: metrics.sadnessAvg },
    { key: "anger", score: metrics.angerAvg },
    { key: "low_energy", score: 1 - metrics.energyAvg },
  ]
    .filter((item) => item.score > 0.35)
    .sort((a, b) => b.score - a.score);

  if (!items.length) {
    items.push({ key: "anxiety", score: 0.4 });
  }

  return items;
}
