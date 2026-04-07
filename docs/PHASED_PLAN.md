# Phased Implementation Plan

## Phase 1: Foundation and Infrastructure ✅

### Deliverables

- [x] 1.1 Monorepo structure (frontend, api-node, analysis-python, infra, docs)
- [x] 1.2 Docker Compose orchestration with all services
- [x] 1.3 Environment templates and health checks
- [x] 1.4 Verify startup order and service discovery

### Status

Complete. Full stack boots healthy in Docker Compose (frontend, api, analysis, postgres, redis, minio, pgadmin).

### Implemented Notes

- Frontend stack migrated to Next.js App Router + Tailwind CSS v4.
- Docker Compose ports and health checks stabilized.
- API image adjusted for Prisma/OpenSSL compatibility on Alpine.

---

## Phase 2: Data Model and Contracts ✅

### Status

- [x] 2.1 PostgreSQL schema modeled in Prisma.
- [x] 2.2 First migration created/applied.
- [x] 2.3 API contracts drafted (Node API + Analysis API OpenAPI files).
- [x] 2.4 Emotion taxonomy and score format aligned in schema/contracts.
- [x] Backend route skeletons implemented for journals, trends, and recommendations.

Phase 2 is complete enough to proceed. Remaining work now belongs to Phase 3 implementation and later refinement phases.

### 2.1 PostgreSQL Schema Design

- Journal entries with audio metadata and analysis results
- WeeklyTrend aggregates for emotional evolution
- Recommendations with personalization data
- ActivityLibrary for self-regulation activities
- ProsodyFeature storage for ML debugging

### 2.2 Migration Strategy

- Prisma migrations for version control
- Index optimization for timeline/trend queries
- SQL extensions (uuid-ossp) in postgres-init.sql
- Initial migration generated and applied: `20260404003546_init_phase2_schema`
- Prisma schema validates successfully in Docker.

### 2.3 API Contract Definitions

- Frontend ↔ Node.js endpoints (upload, status, trends, recommendations)
- Node.js ↔ Python FastAPI contract (analysis request/callback)
- Request/response schemas with validation
- Express route skeletons implemented and returning valid JSON responses.

### 2.4 Emotion Taxonomy & Scoring

- Normalized 0..1 scale for consistency across services
- Six dimensions: joy, sadness, anger, anxiety, calm, energy
- Prosody weight (30%) + semantic weight (70%) in fusion

---

## Phase 3: Audio Ingestion Pipeline 🎙️

### Status

- [x] 3.1 Frontend audio capture page implemented (MediaRecorder + timer + upload UI).
- [x] 3.2 Node upload endpoint implemented (multer validation + MinIO upload + journal create).
- [x] 3.3 Queue + worker scaffolding implemented (Bull queue, Redis wiring, worker service in Docker Compose).
- [x] 3.4 Lifecycle hardening completed (worker dispatch sends callback URL, Python posts completion/failure callback, and lifecycle now closes on `complete/failed`).
- [x] End-to-end ingestion validation completed (upload persistence, queue dispatch, happy-path status advance, failure-path retries + dead-letter evidence).

### Implemented Notes

- Added `api-worker` service to Docker Compose and worker entry script.
- API startup now verifies object storage and reports it in `/api/health`.
- Frontend replaced placeholder page with the first recording/upload experience.
- Worker lifecycle handling now marks `analyzing` after dispatch and captures final retry exhaustion in a dead-letter queue.
- Callback path is now aligned end-to-end between worker dispatch and Python async callback posting.
- Runtime validation now confirmed both happy path (`queued → analyzing`) and failure path (`queued → transcribing → failed` after retries).

### 3.1 Frontend Audio Capture

- Browser MediaRecorder API
- Next.js App Router page/component with duration timer
- Upload progress indicator
- Retry/error handling UX

### 3.2 Node Upload Endpoint

- Multipart form handling (multer)
- Audio validation (format, duration, size)
- MinIO object storage write
- Journal record persistence with status="queued"

### 3.3 Redis Queue Integration

- Bull queue for async job distribution
- Job persistence and retry logic (3 attempts, exponential backoff)
- Status polling endpoint

### 3.4 Job Lifecycle Management

- State machine: queued → transcribing → analyzing → complete → failed
- Error tracking and recovery
- Dead-letter queue for failed jobs

---

## Phase 4: Python Analysis Engine 🧠

### Status

- [x] 4.1 Real Whisper ASR pipeline implemented via HuggingFace `transformers` (lazy-loaded, `openai/whisper-small` default, fallback on init failure).
- [x] 4.2 Real prosody extraction implemented (pitch, energy, speech rate, pauses, MFCC, spectral features, jitter/shimmer, voiced ratio).
- [x] 4.3 Multimodal emotion classification implemented: zero-shot XLM-RoBERTa for text (`TEXT_EMOTION_MODEL_ID`) + wav2vec2 for audio (`AUDIO_EMOTION_MODEL_ID`), both with fallback.
- [x] 4.4 Multimodal fusion (semantic 70% + audio 30%) implemented; callback now includes `semanticScores`, `prosodyScores`, `semanticWeight`, `prosodyWeight`, `modelVersion`.

Phase 4 complete. The analysis pipeline is fully multimodal.

### Implemented Notes

- Python analysis service downloads audio directly from MinIO using `audioObjectKey`.
- Real prosody extraction is active (pitch, energy, speech rate, pause ratio, MFCC, spectral features, jitter/shimmer, voiced ratio).
- Transcription: `transcription.py` lazy-loads a Whisper ASR pipeline (`openai/whisper-small` default). Falls back to lightweight generated transcription if transformers init fails.
- Text emotion: `text_emotion_model.py` lazy-loads zero-shot classification pipeline (`joeddav/xlm-roberta-large-xnli` default). Falls back to Portuguese lexical scoring.
- Audio emotion: `classify_audio_emotions()` in `prosody.py` lazy-loads wav2vec2 audio classification pipeline (`ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` default). Falls back to prosody-feature heuristics.
- Fusion: `_fuse_emotion_scores()` in `analysis_tasks.py` applies `SEMANTIC_WEIGHT=0.7 / PROSODY_WEIGHT=0.3`; model version reported as `"0.2.0-multimodal"`.
- Callback payload extended: `semanticScores`, `prosodyScores`, `semanticWeight`, `prosodyWeight`, `modelVersion` added to response and persisted in Node/PostgreSQL.
- Dockerfile bakes thread-limiting environment variables (`OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`, `TOKENIZERS_PARALLELISM=false`) to prevent OpenBLAS/OpenMP hangs in Docker.
- Node callback route ignores duplicate callbacks for already-finalized journals; extended `callbackSchema` (Joi) now validates all new fields.
- `ActivityLibrary` seed dataset active with idempotent `seed:activities` command.

### 4.1 Transcription Service

- Whisper ASR via HuggingFace `transformers` (lazy-loaded, `WHISPER_MODEL_ID` env var, default `openai/whisper-small`)
- Portuguese-first language support (pt-BR / pt-PT)
- Audio download from MinIO
- Graceful fallback when model init fails

### 4.2 Prosody Feature Extraction

- Pitch analysis (mean, variance, contour regularity)
- Energy metrics (intensity, variation)
- Speech rate and pause ratio calculation
- Spectral features (MFCC, centroid)
- Jitter, shimmer, voiced ratio

### 4.3 Emotion Classification

- **Text**: Zero-shot classification via `transformers` pipeline (multilingual XLM-RoBERTa default); Portuguese lexical fallback
- **Audio**: wav2vec2 audio classification pipeline; prosody-heuristic fallback
- Both models configurable via `TEXT_EMOTION_MODEL_ID` / `AUDIO_EMOTION_MODEL_ID` env vars

### 4.4 Fusion and Callback

- `_fuse_emotion_scores()`: semantic × 0.7 + audio × 0.3, clamped to 0..1
- Intermediate scores (`semanticScores`, `prosodyScores`) and metadata (`semanticWeight`, `prosodyWeight`, `modelVersion`) included in callback
- Durable persistence through Node callback endpoint

---

## Phase 5: Trends and Recommendations 📈

### 5.1 Weekly Aggregation Scheduler

- Compute daily and weekly emotion averages
- Calculate trend direction (linear regression)
- Measure emotional volatility (std dev)
- Track completion rate (entries per week)

### 5.2 Recommendation Engine

- Rule-based logic: high anxiety → calming activities
- Personalization heuristics based on user profile
- Confidence scoring and ranking
- Expected impact quantification
- Optional LLM enrichment via HuggingFace Inference API (Portuguese rationale, impact metric, confidence boost)
- Graceful deterministic fallback when `HF_API_TOKEN` not configured

### Phase 5 Progress Notes

- Migrated from weekly to **daily** aggregation (2026-04-06): `WeeklyTrend` → `DailyTrend`, `/api/trends/daily`, `/api/recommendations/generate-daily`; Prisma migration history consolidated into single baseline (`20260407_baseline_schema`).
- Daily generation flow persists `DailyTrend` (upsert) and recreates day-scoped `Recommendation` records for deterministic reruns.
- Confidence, rationale, and expected impact fields populated with rule-based baseline.
- Recommendation selection applies contraindication filtering and re-ranks with positive/negative feedback and completion history.
- Added `POST /api/recommendations/:recommendationId/complete` endpoint (optional client-provided `completedAt`).
- **LLM Enrichment (2026-04-07)**: Added optional `llmRecommendationService.ts` that calls HuggingFace Inference API (default `mistralai/Mistral-7B-Instruct-v0.3`) to generate Portuguese rationale, `expectedImpactMetric`, `expectedImpactDelta`, and `confidenceBoost` for each ranked activity. Falls back to deterministic rationale when `HF_API_TOKEN` is not set. API/worker services now accept `HF_API_TOKEN`, `HF_TEXT_GEN_MODEL`, and `HF_INFERENCE_URL` env vars.

### 5.3 Persistence & Exposure

- Store recommendations with rationale and expiry
- Accept user feedback (positive/negative/neutral)
- Expose API endpoints for retrieval and feedback

### 5.4 Scheduled Execution

- Weekly recomputation task (node-cron)
- Triggered after aggregation completion
- Idempotent operation (safe to retry)

---

## Phase 6: Frontend Insights Dashboard 💻

### Current Frontend Base

- [x] Next.js app shell running in Docker.
- [x] Tailwind v4 base CSS wiring in place.
- [x] Dashboard feature pages/components implemented for MVP scope.

### Phase 6 Progress Notes

- Frontend now loads recommendation cards from `GET /api/recommendations`.
- Added "Marcar como feita" action wired to `POST /api/recommendations/:recommendationId/complete` and local completion state refresh.
- Added frontend trigger for `POST /api/recommendations/generate-weekly` with automatic recommendation list refresh after generation.
- Added frontend feedback controls (`positive/neutral/negative`) wired to `POST /api/recommendations/:recommendationId/feedback` with local UI state updates.
- Added frontend journal status polling panel after upload, tracking `queued/analyzing/complete/failed` transitions through `GET /api/journals/:journalId/status`.
- Added frontend journal timeline list from `GET /api/journals` with status badges, timestamps, duration, and transcription preview.
- Added frontend emotion evolution chart wired to `GET /api/trends/weekly` using weekly normalized emotion series.
- Added timeline expand interaction for journal details (`GET /api/journals/:journalId`) with full transcription and key emotion scores.
- Added week-over-week trend direction indicators (delta cards) for emotion series in the weekly chart section.
- Added recommendation filtering controls in frontend panel (by intensity and target emotion).
- Added recommendation ordering toggles in frontend panel (confidence, duration, newest).
- Added quick recommendation presets (calming, energizing, short) to prefill filter/sort selections.
- Added Sonner toast notifications for upload, refresh, generation, completion, and feedback actions.
- Added smooth in-page section navigation for capture, trends, timeline, and recommendations.

### 6.1 Emotion Evolution Chart

- Recharts ComposedChart with multiple series
- 7-day rolling window visualization
- Per-emotion line graphs (joy, sadness, anger, anxiety, calm, energy)
- Trend arrows and week-over-week comparison

### 6.2 Recommendations Panel

- Activity cards with name, duration, intensity
- Rationale text and expected impact display
- "Mark as Done" feedback action
- Filter and sorting by emotion/intensity

### 6.3 Journal Timeline

- Vertically stacked entry cards (newest first)
- Date, duration, emotion summary per entry
- Transcription snippet preview
- Click to expand → modal with full details

### 6.4 Responsive UX

- Mobile-first Tailwind v4 layout in Next.js
- Accessible audio recording/playback controls
- Sonner toast notifications
- Smooth navigation between tabs

### Phase 6 Status

Phase 6 is complete for the MVP dashboard scope. The frontend now covers recording, weekly trends, recommendation interaction, and journal exploration in a responsive single-page workflow.

---

## Phase 7: Documentation & Deployment 📚

### 7.1 Project Documentation

- [x] 7.1.1 README expanded with core user workflows and API quick reference
- [x] 7.1.2 Architecture overview diagrams integrated in README
- [x] 7.1.3 API endpoint documentation placeholder created
- [x] 7.1.4 Quick start guide verified working end-to-end

### 7.2 Code Cleanup

- [x] 7.2.1 Frontend TypeScript type-checked successfully (npm run type-check passes)
- [x] 7.2.2 API TypeScript build successful (npm run build passes, no errors)
- [x] 7.2.3 Verified no console.log or TODO markers in production code
- [x] 7.2.4 Code formatting consistent across services (TypeScript/Python formatted)

### 7.3 Testing & Validation

- [x] 7.3.1 Created comprehensive TESTING_CHECKLIST.md with 80+ manual test points
- [x] 7.3.2 Checklist covers all user workflows (record → analyze → trend → recommend)
- [x] 7.3.3 API endpoint testing section with cURL examples
- [x] 7.3.4 Performance and stability guidelines included
- [x] 7.3.5 Troubleshooting section added for common issues

### Phase 7 Progress Notes

- Expanded README with four core user workflows:
  1. Record & upload audio with real-time status polling
  2. View weekly emotion trends and recommendation generation
  3. Interact with recommendations (mark as done, provide feedback)
  4. Explore journal timeline with detailed emotion breakdown
- Created detailed testing checklist for manual QA:
  - Infrastructure verification (8 checks)
  - Audio recording (6 checks)
  - Upload & status (5 checks)
  - Error handling (3 checks)
  - Analysis results (9 checks)
  - Journal persistence (3 checks)
  - Weekly trends (9 checks)
  - Recommendations (11 checks)
  - API integration (6 checks with endpoints)
  - Performance (3 checks)
  - UX & accessibility (5 checks)
  - Sign-off criteria (8 checks)
  - Troubleshooting guide with common issues
- Verified code quality:
  - Frontend: TypeScript passes without errors
  - API: TypeScript compilation successful
  - No console.log statements in production code
  - No TODO/FIXME markers (cleanup completed in previous phases)
- Updated README with implementation status showing all phases green (✅)
- Added API quick reference section with common cURL commands
- All documentation maintains focus on real data testing (no demo seeds)

### Status

🎉 **Phase 7 Complete.** Project ready for manual testing and university presentation. All phases 1–7 finished with comprehensive documentation, clean code, and detailed validation checklist.

---

## Parallelization Opportunities

After Phase 1 completion:

1. **Frontend UI** (recording, dashboard mockups) can proceed in parallel with backend schema (Phase 2)
2. **Emotion analysis logic** (4.1–4.3) can be built while node infrastructure is stabilizing (Phase 3)
3. **Recommendation engine** (5.2) can be prototyped with mocked trends during Phase 5
4. **Frontend dashboard** (Phase 6) can be developed against mocked API while Phase 4 finalizes

---

## Immediate Next Steps

**Phase 7 Complete!** The MVP is ready for manual testing and evaluation.

### For Testing & Validation

1. Follow [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) systematically
2. Record real audio entries and create authentic data
3. Verify system behavior across all workflows
4. Document any unexpected behavior or edge cases
5. User acceptance testing with stakeholders

### For Deployment (if needed)

1. Replace MinIO with production object storage (S3, Azure Blob)
2. Replace PostgreSQL with managed database (RDS, Azure Database)
3. Replace Redis with managed cache (ElastiCache, Redis Cloud)
4. Configure SSL/TLS certificates for HTTPS
5. Set up authentication and multi-user support
6. Deploy to cloud platform (AWS, Azure, GCP) or on-premises

---

## Critical Path Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
           ↓         ↓         ↓          ↓         ↓
   (Can start     (Frontend) (Emotion)  (Apps)   (Polish)
    frontend      module     module
    parallel
    after 1)
```

---

## Verification Checkpoints

| Checkpoint                | Phase | Gate                                             |
| ------------------------- | ----- | ------------------------------------------------ |
| Docker Compose health     | 1.4   | All services + containers healthy                |
| Schema migration          | 2.2   | Prisma creates tables without errors             |
| Upload endpoint           | 3.2   | File persists to MinIO + DB record created       |
| Queue job execution       | 3.3   | Job queued, polled, status updates               |
| Transcription output      | 4.1   | Portuguese text extracted from WAV               |
| Prosody features          | 4.2   | Numeric features extracted (pitch, energy, etc.) |
| Emotion vector            | 4.3   | 6D emotion array normalized 0..1                 |
| Callback persistence      | 4.4   | Results stored in Journal record                 |
| Weekly aggregates         | 5.1   | WeeklyTrend record created with averages         |
| Recommendation generation | 5.2   | Activity suggestions ranked by confidence        |
| Chart rendering           | 6.1   | Recharts graph displays 7-day trends             |
| End-to-end flow           | 7.1   | Upload audio → see result in dashboard           |
