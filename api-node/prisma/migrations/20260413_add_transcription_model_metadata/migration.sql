ALTER TABLE "Journal"
ADD COLUMN IF NOT EXISTS "transcriptionModelKey" TEXT,
ADD COLUMN IF NOT EXISTS "transcriptionModelId" TEXT;
