export const allowedMimeTypes = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
]);

export function inferAudioExtension(mimeType: string, originalName: string) {
  const filenameExtension = originalName.includes(".")
    ? originalName.split(".").pop()?.toLowerCase()
    : undefined;

  if (filenameExtension) {
    return filenameExtension;
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "wav";
}

export function normalizeDurationSeconds(rawValue: unknown) {
  if (typeof rawValue !== "string") {
    return 0;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

export function buildProsodyFeatureData(
  prosodyFeatures: Record<string, unknown>,
) {
  return {
    meanPitchHz: numberOrNull(prosodyFeatures.meanPitchHz),
    pitchStdDev: numberOrNull(prosodyFeatures.pitchStdDev),
    minPitchHz: numberOrNull(prosodyFeatures.minPitchHz),
    maxPitchHz: numberOrNull(prosodyFeatures.maxPitchHz),
    pitchContourReg: numberOrNull(prosodyFeatures.pitchContourReg),
    meanEnergy: numberOrNull(prosodyFeatures.meanEnergy),
    energyStdDev: numberOrNull(prosodyFeatures.energyStdDev),
    speechRate: numberOrNull(prosodyFeatures.speechRate),
    pauseRatio: numberOrNull(prosodyFeatures.pauseRatio),
    mfccMean: Array.isArray(prosodyFeatures.mfccMean)
      ? prosodyFeatures.mfccMean.filter(
          (item): item is number => typeof item === "number",
        )
      : [],
    spectralCentroid: numberOrNull(prosodyFeatures.spectralCentroid),
    spectralSpread: numberOrNull(prosodyFeatures.spectralSpread),
    jitter: numberOrNull(prosodyFeatures.jitter),
    shimmer: numberOrNull(prosodyFeatures.shimmer),
    voicedRatio: numberOrNull(prosodyFeatures.voicedRatio),
  };
}
