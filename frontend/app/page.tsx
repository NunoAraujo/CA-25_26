"use client";

import { useCallback, useEffect, useMemo } from "react";
import { CapturePanel } from "../src/components/home/CapturePanel";
import { RecommendationsPanel } from "../src/components/home/RecommendationsPanel";
import { TrendsPanel } from "../src/components/home/TrendsPanel";
import { useAudioCapture } from "../src/hooks/useAudioCapture";
import { useJournalTimeline } from "../src/hooks/useJournalTimeline";
import { useRecommendations } from "../src/hooks/useRecommendations";
import { useDailyTrends } from "../src/hooks/useDailyTrends";

export default function HomePage() {
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api",
    [],
  );

  const trends = useDailyTrends(apiBaseUrl);
  const timeline = useJournalTimeline(apiBaseUrl);
  const recommendations = useRecommendations(apiBaseUrl);

  const handleAnalysisComplete = useCallback(() => {
    void trends.loadDailyTrends();
    void timeline.loadJournals();
  }, [trends, timeline]);

  const capture = useAudioCapture(apiBaseUrl, handleAnalysisComplete);

  useEffect(() => {
    void trends.loadDailyTrends();
    void timeline.loadJournals();
    void recommendations.loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      {/* Navbar */}
      <nav className="mx-auto mb-8 flex w-fit items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-2 shadow-lg">
        <a
          className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          href="#capture"
        >
          Captura
        </a>
        <a
          className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          href="#trends"
        >
          Tendências
        </a>
        <a
          className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          href="#recommendations"
        >
          Recomendações
        </a>
      </nav>

      <CapturePanel
        audioBlob={capture.audioBlob}
        audioUrl={capture.audioUrl}
        elapsedSeconds={capture.elapsedSeconds}
        errorMessage={capture.errorMessage}
        isPollingJournalStatus={capture.isPollingJournalStatus}
        isRecording={capture.isRecording}
        isUploading={capture.isUploading}
        journalStatus={capture.journalStatus}
        journalStatusError={capture.journalStatusError}
        onPollStatus={capture.pollJournalStatus}
        onStartRecording={capture.startRecording}
        onStopRecording={capture.stopRecording}
        onUploadRecording={capture.uploadRecording}
        recordingStateLabel={capture.recordingStateLabel}
        statusPollAttempt={capture.statusPollAttempt}
        uploadState={capture.uploadState}
      />

      <TrendsPanel
        isLoadingDailyTrends={trends.isLoadingDailyTrends}
        isLoadingJournals={timeline.isLoadingJournals}
        onRefresh={trends.loadDailyTrends}
        onRefreshTimeline={timeline.loadJournals}
        trendDeltaCards={trends.trendDeltaCards}
        dailyTrends={trends.dailyTrends}
        dailyTrendsError={trends.dailyTrendsError}
        journals={timeline.journals}
      />

      <RecommendationsPanel
        completingRecommendationId={recommendations.completingRecommendationId}
        feedbackingRecommendationId={
          recommendations.feedbackingRecommendationId
        }
        isGeneratingRecommendations={
          recommendations.isGeneratingRecommendations
        }
        isLoadingRecommendations={recommendations.isLoadingRecommendations}
        onApplyPreset={recommendations.applyPreset}
        onComplete={recommendations.completeRecommendation}
        onFeedback={recommendations.submitRecommendationFeedback}
        onGenerate={recommendations.generateDailyRecommendations}
        onRefresh={recommendations.loadRecommendations}
        onLoadAll={() => recommendations.loadRecommendations({ all: true })}
        onSetEmotionFilter={recommendations.setRecommendationEmotionFilter}
        onSetIntensityFilter={recommendations.setRecommendationIntensityFilter}
        onSetOrderBy={recommendations.setRecommendationOrderBy}
        recommendationEmotionFilter={
          recommendations.recommendationEmotionFilter
        }
        recommendationEmotionOptions={
          recommendations.recommendationEmotionOptions
        }
        recommendationError={recommendations.recommendationError}
        recommendationInfo={recommendations.recommendationInfo}
        recommendationIntensityFilter={
          recommendations.recommendationIntensityFilter
        }
        recommendationIntensityOptions={
          recommendations.recommendationIntensityOptions
        }
        recommendationOrderBy={recommendations.recommendationOrderBy}
        recommendations={recommendations.recommendations}
        sortedRecommendations={recommendations.sortedRecommendations}
      />
    </main>
  );
}