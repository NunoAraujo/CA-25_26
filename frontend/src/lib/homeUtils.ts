import { RecommendationPreset } from "../types/home";

export function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function getRecordingStateLabel(
  isRecording: boolean,
  hasAudio: boolean,
) {
  if (isRecording) {
    return "A gravar";
  }

  if (hasAudio) {
    return "Pronto";
  }

  return "Em espera";
}

export function statusBadgeClasses(status: string) {
  if (status === "complete") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  if (status === "failed") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }

  if (status === "analyzing" || status === "transcribing") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  return "border-slate-300 bg-slate-50 text-slate-700";
}

export function formatWeekLabel(rawDate: string) {
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? rawDate
    : date.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
      });
}

export function deltaDirection(delta: number) {
  if (delta > 0.001) {
    return "up";
  }

  if (delta < -0.001) {
    return "down";
  }

  return "flat";
}

export function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
}

export function applyRecommendationPreset(
  preset: RecommendationPreset,
  setIntensity: (value: string) => void,
  setEmotion: (value: string) => void,
  setOrder: (value: string) => void,
) {
  if (preset === "calming") {
    setIntensity("low");
    setEmotion("anxiety");
    setOrder("confidence");
    return;
  }

  if (preset === "energizing") {
    setIntensity("medium");
    setEmotion("low_energy");
    setOrder("confidence");
    return;
  }

  setIntensity("all");
  setEmotion("all");
  setOrder("duration");
}
