"use client";

import { useEffect, useMemo } from "react";
import { CapturePanel } from "../src/components/home/CapturePanel";
import { RecommendationsPanel } from "../src/components/home/RecommendationsPanel";
import { TimelinePanel } from "../src/components/home/TimelinePanel";
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

  const capture = useAudioCapture(apiBaseUrl);
  const trends = useDailyTrends(apiBaseUrl);
  const timeline = useJournalTimeline(apiBaseUrl);
  const recommendations = useRecommendations(apiBaseUrl);

  useEffect(() => {
    void trends.loadDailyTrends();
    void timeline.loadJournals();
    void recommendations.loadRecommendations();
  }, []);

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <nav className="mx-auto mb-6 flex max-w-6xl flex-wrap gap-2 rounded-full border border-(--line) bg-(--paper) p-2 shadow-[0_18px_50px_rgba(82,55,31,0.08)]">
        <a
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
          href="#capture"
        >
          Captura
        </a>
        <a
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
          href="#trends"
        >
          Tendencias
        </a>
        <a
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
          href="#timeline"
        >
          Timeline
        </a>
        <a
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
          href="#recommendations"
        >
          Recomendacoes
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
        onRefresh={trends.loadDailyTrends}
        trendDeltaCards={trends.trendDeltaCards}
        dailyTrends={trends.dailyTrends}
        dailyTrendsError={trends.dailyTrendsError}
        journals={timeline.journals}
      />

      <TimelinePanel
        expandedJournalId={timeline.expandedJournalId}
        isLoadingJournals={timeline.isLoadingJournals}
        journalDetailError={timeline.journalDetailError}
        journalDetailsById={timeline.journalDetailsById}
        journals={timeline.journals}
        journalsError={timeline.journalsError}
        loadingJournalDetailId={timeline.loadingJournalDetailId}
        onRefresh={timeline.loadJournals}
        onToggleDetail={timeline.toggleJournalDetail}
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
