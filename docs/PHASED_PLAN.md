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

- [x] 4.1 Initial transcription pipeline started (audio retrieval from MinIO + lightweight fallback transcription for stable local execution).
- [x] 4.2 Initial prosody extraction implemented (pitch, energy, speech rate, pauses, MFCC, spectral features, jitter/shimmer).
- [x] 4.3 Initial emotion scoring implemented with heuristic Portuguese text/prosody fusion (HuggingFace model integration pending).
- [x] 4.4 Callback flow now persists computed transcription/emotion/prosody payload from Python to Node.

Phase 4 has started with a working end-to-end analysis pipeline slice. Model quality hardening, Whisper/HuggingFace integration, and richer classification calibration remain for next increments.

### Implemented Notes

- Python analysis service now downloads audio directly from MinIO using `audioObjectKey`.
- Real prosody extraction is now active (pitch, energy, speech rate, pause ratio, MFCC, spectral features, jitter/shimmer, voiced ratio).
- Callback payload now persists computed prosody and a generated transcription/emotion vector into Node/PostgreSQL.
- End-to-end validation confirmed Phase 4 happy path reaches `complete` with persisted prosody and score fields.
- Lightweight transcription fallback is currently used for stability in local Docker while full Whisper/HuggingFace model integration is finalized.
- Node callback route now ignores duplicate callbacks for already-finalized journals and rejects conflicting late callbacks.
- Added first `ActivityLibrary` seed dataset and a dedicated `seed:activities` command in the Node API.
- Seed command validated as idempotent (`created: 5` on first run, `updated: 5` on second run).

### 4.1 Transcription Service

- OpenAI Whisper (tiny model for MVP speed)
- Portuguese-first language support (pt-BR)
- Audio download from MinIO
- Error handling and timeout management

### 4.2 Prosody Feature Extraction

- Pitch analysis (mean, variance, contour regularity)
- Energy metrics (intensity, variation)
- Speech rate and pause ratio calculation
- Spectral features (MFCC, centroid)
- Audio quality validation (SNR threshold)

### 4.3 Emotion Classification

- HuggingFace multilingual sentiment model
- Portuguese transcript analysis
- Mapping to 6-dimension emotion vector
- Confidence scoring

### 4.4 Fusion and Callback

- Combine prosody (30%) + semantic (70%) signals
- Normalize emotion outputs to 0..1 scale
- Callback to Node with results
- Durable persistence through controlled API

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

### Phase 5 Progress Notes

- Added initial `POST /api/recommendations/generate-weekly` endpoint to compute weekly trend snapshots from completed journals and generate ranked recommendations from seeded `ActivityLibrary` entries.
- Generation flow now persists `WeeklyTrend` (upsert) and recreates week-scoped `Recommendation` records for deterministic reruns.
- Confidence, rationale, and expected impact fields are now populated with a first rule-based baseline.
- Endpoint runtime validation completed (`/api/recommendations/generate-weekly` returns persisted trend + generated recommendations).
- Recommendation selection now applies contraindication filtering inferred from recent transcription signals and re-ranks candidates with recent positive/negative feedback history.
- Added `POST /api/recommendations/:recommendationId/complete` endpoint to persist recommendation completion timestamps (`completedAt`) with optional client-provided completion time.
- Weekly recommendation ranking now incorporates recent completion history as an additional positive signal alongside explicit feedback.

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
- [~] Dashboard feature pages/components started (recommendation panel + completion action wired).

### Phase 6 Progress Notes

- Frontend now loads recommendation cards from `GET /api/recommendations`.
- Added "Marcar como feita" action wired to `POST /api/recommendations/:recommendationId/complete` and local completion state refresh.
- Added frontend trigger for `POST /api/recommendations/generate-weekly` with automatic recommendation list refresh after generation.
- Added frontend feedback controls (`positive/neutral/negative`) wired to `POST /api/recommendations/:recommendationId/feedback` with local UI state updates.
- Added frontend journal status polling panel after upload, tracking `queued/analyzing/complete/failed` transitions through `GET /api/journals/:journalId/status`.
- Added frontend journal timeline list from `GET /api/journals` with status badges, timestamps, duration, and transcription preview.

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

---

## Phase 7: QA, Privacy & Hardening 🔒

### 7.1 Integration Tests

- End-to-end: upload → queue → analysis → trends → recommendations
- Fixture-based test scenarios
- Jest + Supertest for API, pytest for Python

### 7.2 Model Smoke Tests

- Fixture dataset with known emotion labels
- Regression tracking against baseline model
- Tolerance bands for accuracy (±0.15)

### 7.3 Observability

- Structured logging across all services (pino + python-json-logger)
- Correlation IDs / trace IDs propagation
- Metrics: queue latency, analysis time, failed jobs

### 7.4 Privacy Controls

- DELETE endpoint for soft/hard deletes
- Retention policy documentation
- Deletion control UX
- No audio content in logs

---

## Parallelization Opportunities

After Phase 1 completion:

1. **Frontend UI** (recording, dashboard mockups) can proceed in parallel with backend schema (Phase 2)
2. **Emotion analysis logic** (4.1–4.3) can be built while node infrastructure is stabilizing (Phase 3)
3. **Recommendation engine** (5.2) can be prototyped with mocked trends during Phase 5
4. **Frontend dashboard** (Phase 6) can be developed against mocked API while Phase 4 finalizes

---

## Immediate Next Steps (Phase 4)

1. Integrate HuggingFace multilingual sentiment model to replace heuristic emotion scoring baseline.
2. Replace lightweight transcription fallback with full Whisper pipeline after container runtime tuning.
3. Add Python-side analysis smoke tests with fixture audio files.
4. Add frontend emotion evolution chart wired to `GET /api/trends/weekly`.

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
