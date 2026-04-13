ALTER TABLE "Journal" RENAME COLUMN "anxietyScore" TO "fearScore";
ALTER TABLE "Journal" RENAME COLUMN "calmScore" TO "disgustScore";
ALTER TABLE "Journal" RENAME COLUMN "energyScore" TO "surpriseScore";

ALTER TABLE "DailyTrend" RENAME COLUMN "avgAnxietyScore" TO "avgFearScore";
ALTER TABLE "DailyTrend" RENAME COLUMN "avgCalmScore" TO "avgDisgustScore";
ALTER TABLE "DailyTrend" RENAME COLUMN "avgEnergyScore" TO "avgSurpriseScore";

ALTER TABLE "DailyTrend" RENAME COLUMN "anxietyTrend" TO "fearTrend";
ALTER TABLE "DailyTrend" RENAME COLUMN "calmTrend" TO "disgustTrend";
ALTER TABLE "DailyTrend" RENAME COLUMN "energyTrend" TO "surpriseTrend";
