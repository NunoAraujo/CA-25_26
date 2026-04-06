-- Move weekly trend persistence to daily trend semantics.
ALTER TABLE "Recommendation" DROP CONSTRAINT IF EXISTS "Recommendation_weeklyTrendId_fkey";

DROP INDEX IF EXISTS "Recommendation_userId_weeklyTrendId_idx";
DROP INDEX IF EXISTS "WeeklyTrend_userId_weekStart_idx";
DROP INDEX IF EXISTS "WeeklyTrend_userId_weekStart_key";

ALTER TABLE "Recommendation" RENAME COLUMN "weeklyTrendId" TO "dailyTrendId";

ALTER TABLE "WeeklyTrend" RENAME TO "DailyTrend";
ALTER TABLE "DailyTrend" RENAME CONSTRAINT "WeeklyTrend_pkey" TO "DailyTrend_pkey";
ALTER TABLE "DailyTrend" RENAME CONSTRAINT "WeeklyTrend_userId_fkey" TO "DailyTrend_userId_fkey";

ALTER TABLE "DailyTrend" RENAME COLUMN "weekStart" TO "dayStart";
ALTER TABLE "DailyTrend" RENAME COLUMN "weekEnd" TO "dayEnd";

CREATE INDEX "DailyTrend_userId_dayStart_idx" ON "DailyTrend"("userId", "dayStart");
CREATE UNIQUE INDEX "DailyTrend_userId_dayStart_key" ON "DailyTrend"("userId", "dayStart");
CREATE INDEX "Recommendation_userId_dailyTrendId_idx" ON "Recommendation"("userId", "dailyTrendId");

ALTER TABLE "Recommendation"
  ADD CONSTRAINT "Recommendation_dailyTrendId_fkey"
  FOREIGN KEY ("dailyTrendId") REFERENCES "DailyTrend"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
