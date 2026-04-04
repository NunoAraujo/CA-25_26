-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('queued', 'transcribing', 'analyzing', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "RecommendationFeedback" AS ENUM ('positive', 'neutral', 'negative');

-- CreateEnum
CREATE TYPE "ActivityIntensity" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audioObjectKey" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JournalStatus" NOT NULL DEFAULT 'queued',
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL,
    "transcription" TEXT,
    "transcriptionLang" TEXT NOT NULL DEFAULT 'pt-BR',
    "errorMessage" TEXT,
    "joyScore" DOUBLE PRECISION,
    "sadnessScore" DOUBLE PRECISION,
    "angerScore" DOUBLE PRECISION,
    "anxietyScore" DOUBLE PRECISION,
    "calmScore" DOUBLE PRECISION,
    "energyScore" DOUBLE PRECISION,
    "prosodyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "semanticWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "modelVersion" TEXT NOT NULL DEFAULT '0.1.0',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProsodyFeature" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "meanPitchHz" DOUBLE PRECISION,
    "pitchStdDev" DOUBLE PRECISION,
    "minPitchHz" DOUBLE PRECISION,
    "maxPitchHz" DOUBLE PRECISION,
    "pitchContourReg" DOUBLE PRECISION,
    "meanEnergy" DOUBLE PRECISION,
    "energyStdDev" DOUBLE PRECISION,
    "speechRate" DOUBLE PRECISION,
    "pauseRatio" DOUBLE PRECISION,
    "mfccMean" DOUBLE PRECISION[],
    "spectralCentroid" DOUBLE PRECISION,
    "spectralSpread" DOUBLE PRECISION,
    "jitter" DOUBLE PRECISION,
    "shimmer" DOUBLE PRECISION,
    "voicedRatio" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProsodyFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyTrend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "avgJoyScore" DOUBLE PRECISION NOT NULL,
    "avgSadnessScore" DOUBLE PRECISION NOT NULL,
    "avgAngerScore" DOUBLE PRECISION NOT NULL,
    "avgAnxietyScore" DOUBLE PRECISION NOT NULL,
    "avgCalmScore" DOUBLE PRECISION NOT NULL,
    "avgEnergyScore" DOUBLE PRECISION NOT NULL,
    "joyTrend" DOUBLE PRECISION,
    "sadnessTrend" DOUBLE PRECISION,
    "angerTrend" DOUBLE PRECISION,
    "anxietyTrend" DOUBLE PRECISION,
    "calmTrend" DOUBLE PRECISION,
    "energyTrend" DOUBLE PRECISION,
    "emotionalVolatility" DOUBLE PRECISION NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "completionRate" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyTrend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weeklyTrendId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "activityDurationMin" INTEGER NOT NULL,
    "activityIntensity" "ActivityIntensity" NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "expectedImpactMetric" TEXT,
    "expectedImpactDelta" DOUBLE PRECISION,
    "feedback" "RecommendationFeedback",
    "feedbackAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalSuggestion" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "suggestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLibrary" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "intensity" "ActivityIntensity" NOT NULL,
    "category" TEXT NOT NULL,
    "targetEmotions" TEXT[],
    "contraindications" TEXT[],
    "instructions" TEXT NOT NULL,
    "resources" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelMetrics" (
    "id" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "totalAnalyzed" INTEGER NOT NULL,
    "avgLatencyMs" DOUBLE PRECISION NOT NULL,
    "failureRate" DOUBLE PRECISION NOT NULL,
    "whisperWer" DOUBLE PRECISION,
    "emotionF1" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_audioObjectKey_key" ON "Journal"("audioObjectKey");

-- CreateIndex
CREATE INDEX "Journal_userId_uploadedAt_idx" ON "Journal"("userId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Journal_status_idx" ON "Journal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProsodyFeature_journalId_key" ON "ProsodyFeature"("journalId");

-- CreateIndex
CREATE INDEX "WeeklyTrend_userId_weekStart_idx" ON "WeeklyTrend"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyTrend_userId_weekStart_key" ON "WeeklyTrend"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "Recommendation_userId_weeklyTrendId_idx" ON "Recommendation"("userId", "weeklyTrendId");

-- CreateIndex
CREATE INDEX "Recommendation_activityId_idx" ON "Recommendation"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalSuggestion_journalId_recommendationId_key" ON "JournalSuggestion"("journalId", "recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLibrary_activityId_key" ON "ActivityLibrary"("activityId");

-- CreateIndex
CREATE INDEX "ActivityLibrary_category_idx" ON "ActivityLibrary"("category");

-- CreateIndex
CREATE INDEX "ModelMetrics_metricDate_idx" ON "ModelMetrics"("metricDate");

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProsodyFeature" ADD CONSTRAINT "ProsodyFeature_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyTrend" ADD CONSTRAINT "WeeklyTrend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_weeklyTrendId_fkey" FOREIGN KEY ("weeklyTrendId") REFERENCES "WeeklyTrend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSuggestion" ADD CONSTRAINT "JournalSuggestion_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSuggestion" ADD CONSTRAINT "JournalSuggestion_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
