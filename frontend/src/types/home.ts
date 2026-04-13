export type UploadState = {
  journalId: string;
  status: string;
  createdAt: string;
};

export type JournalStatusState = {
  id: string;
  status: string;
  errorMessage: string | null;
  statusUpdatedAt: string | null;
};

export type Recommendation = {
  id: string;
  activityName: string;
  activityDurationMin: number;
  activityIntensity: string;
  rationale: string;
  confidence: number;
  expectedImpactMetric: string;
  expectedImpactDelta: number;
  feedback: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type EmotionMetricKey =
  | "joy"
  | "sadness"
  | "anger"
  | "fear"
  | "disgust"
  | "surprise";

export type EmotionScores = Record<EmotionMetricKey, number>;

export type JournalTimelineItem = {
  id: string;
  status: string;
  uploadedAt: string;
  recordedAt: string | null;
  durationSeconds: number | null;
  transcription: string | null;
  joyScore: number | null;
  sadnessScore: number | null;
  angerScore: number | null;
  fearScore: number | null;
  disgustScore: number | null;
  surpriseScore: number | null;
};

export type JournalDetail = {
  id: string;
  transcription: string | null;
  joyScore: number | null;
  sadnessScore: number | null;
  angerScore: number | null;
  fearScore: number | null;
  disgustScore: number | null;
  surpriseScore: number | null;
};

export type DailyTrendPoint = {
  dayStart: string;
  joy: number;
  sadness: number;
  anger: number;
  fear: number;
  disgust: number;
  surprise: number;
  entryCount: number;
  emotionalVolatility: number;
};

export type RecommendationFeedback = "positive" | "neutral" | "negative";

export type RecommendationPreset = "calming" | "energizing" | "short";
