# Architecture Overview

## System Architecture

The Audio Journaling MVP uses a **three-tier microservices-lite architecture** optimized for local Docker development:

### Service Layer

1. **Frontend (Next.js + Tailwind v4)**
   - Browser-based web app (App Router) for recording and dashboard visualization
   - Handles audio capture, UI state, charting
   - Calls Node API for data and status

2. **API Gateway (Node.js + Express + TypeScript)**
   - REST API for journal CRUD, upload orchestration, trends, recommendations
   - Orchestrates workflows between frontend and analysis service
   - Manages async job queues via Bull/Redis
   - Handles daily aggregation and recommendation generation
   - Connects to PostgreSQL for persistence

3. **Analysis Engine (Python + FastAPI)**
   - Accepts audio analysis jobs from Node API
   - Runs Whisper ASR transcription via HuggingFace `transformers` pipeline (Portuguese-first, lazy-loaded with fallback)
   - Classifies text emotions using zero-shot XLM-RoBERTa (`TEXT_EMOTION_MODEL_ID`) with lexical fallback
   - Classifies audio emotions using wav2vec2 speech emotion recognition (`AUDIO_EMOTION_MODEL_ID`) with prosody-heuristic fallback
   - Extracts low-level prosody features (pitch, energy, speech rate, MFCC, spectral, jitter/shimmer)
   - Fuses semantic scores (70%) + audio emotion scores (30%) into final emotionVector
   - Sends enriched callback including intermediate scores, fusion weights, and model version
   - Isolated from frontend to optimize for ML model loading; thread-limiting env vars prevent OpenBLAS/OpenMP hangs

4. **Data Layer**
   - PostgreSQL: core relational data (journals, trends, recommendations)
   - Redis: async job queue and cache
   - MinIO: audio object storage (S3-compatible)

### Data Flow

```
User Records Audio
         ↓
Frontend captures WAV
         ↓
POST /api/journals (multipart)
         ↓
Node validates, writes to MinIO, creates Journal record
         ↓
Node enqueues job → Bull queue (Redis)
         ↓
Analysis worker consumes job, calls Python service
         ↓
Python: Whisper ASR → prosody extract → text emotion (XLM-RoBERTa) + audio emotion (wav2vec2) → fuse (0.7/0.3)
         ↓
Python POSTs results to Node callback endpoint
         ↓
Node updates Journal record with emotions, prosody features, and model metadata
         ↓
Daily scheduler computes trends; LLM enriches recommendation rationale (optional)
         ↓
Recommendation generation: rule-based ranking + optional HF LLM rationale/impact
         ↓
Frontend polls GET /api/trends/daily and /api/recommendations
         ↓
Dashboard displays charts + activity suggestions
```

## Technology Stack

| Layer    | Component        | Technology                                                                                    |
| -------- | ---------------- | --------------------------------------------------------------------------------------------- |
| Frontend | Framework        | Next.js 15 + TypeScript                                                                       |
|          | Build Tool       | Next.js runtime/build pipeline                                                                |
|          | Styling          | Tailwind CSS 4                                                                                |
|          | State            | Zustand                                                                                       |
|          | Charts           | Recharts                                                                                      |
|          | HTTP             | Axios + React Query                                                                           |
| API      | Runtime          | Node.js 20 LTS                                                                                |
|          | Framework        | Express 4                                                                                     |
|          | Language         | TypeScript 5                                                                                  |
|          | ORM              | Prisma 5                                                                                      |
|          | Queue            | Bull 4 (Redis backend)                                                                        |
|          | Logging          | Pino 8                                                                                        |
| Analysis | Runtime          | Python 3.11                                                                                   |
|          | Framework        | FastAPI 0.109                                                                                 |
|          | Transcription    | Whisper via HF transformers (lazy, `openai/whisper-small` default)                            |
|          | Audio Processing | librosa 0.10                                                                                  |
|          | Text Emotion     | Zero-shot XLM-RoBERTa (`joeddav/xlm-roberta-large-xnli` default)                              |
|          | Audio Emotion    | wav2vec2 speech emotion (`ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` default) |
|          | ML Runtime       | transformers 4.37 (HuggingFace)                                                               |
| Data     | Database         | PostgreSQL 16                                                                                 |
|          | Cache/Queue      | Redis 7                                                                                       |
|          | Storage          | MinIO (S3-compatible)                                                                         |
| Infra    | Orchestration    | Docker Compose 3.9                                                                            |
|          | Containers       | Docker                                                                                        |

## Database Schema (Phase 2 Detail)

### Core Entities

- **User** – Single-user MVP placeholder
- **Journal** – Audio entry with status lifecycle
- **ProsodyFeature** – Extracted pitch, energy, speech features
- **DailyTrend** – Aggregated emotion scores and volatility
- **Recommendation** – Personalized activity suggestions
- **ActivityLibrary** – Available self-regulation activities
- **EditorRecommendation** – Per-journal recommendation context

### Key Fields

- **Emotion Scores** – Normalized 0..1 for: joy, sadness, anger, anxiety, calm, energy
- **Status Lifecycle** – queued → transcribing → analyzing → complete → failed
- **Metadata** – Timestamps, user feedback, model version (`modelVersion`), fusion weights (`semanticWeight`, `prosodyWeight`), trace IDs
- **Intermediate Scores** – `semanticScores` (text model output) and `prosodyScores` (audio model output) stored for debugging and re-weighting

## API Contracts (Phase 2 Detail)

### Node.js Frontend API

```
POST   /api/journals                           # Upload audio
GET    /api/journals                           # List entries
GET    /api/journals/{id}                      # Get entry details
DELETE /api/journals/{id}                      # Delete entry
GET    /api/journals/{id}/status               # Poll job status
GET    /api/trends/daily                       # Daily emotion evolution
GET    /api/recommendations                    # Get activities
POST   /api/recommendations/generate-daily     # Generate daily recommendations
POST   /api/recommendations/{id}/feedback      # Rate recommendation
POST   /api/recommendations/{id}/complete      # Mark recommendation done
GET    /api/health                             # Service health
```

### Python Analysis API (Node calling)

```
POST   /api/v1/analyze                # Submit analysis job
GET    /api/v1/analyze/{taskId}       # Poll analysis status
POST   /api/journals/{journalId}/analysis-callback  # Python posts results back
GET    /health                        # Service health
```

#### Callback payload fields (`analysis-python` → `api-node`)

| Field             | Type                   | Description                                                               |
| ----------------- | ---------------------- | ------------------------------------------------------------------------- |
| `status`          | `"complete"\|"failed"` | Terminal job status                                                       |
| `transcription`   | `string`               | Whisper ASR transcript                                                    |
| `emotionVector`   | `object`               | Fused emotion scores (0–1) for joy, sadness, anger, anxiety, calm, energy |
| `semanticScores`  | `object`               | Raw text-model emotion scores before fusion                               |
| `prosodyScores`   | `object`               | Raw audio-model emotion scores before fusion                              |
| `prosodyFeatures` | `object`               | Low-level prosody features (pitch, energy, MFCC, etc.)                    |
| `semanticWeight`  | `number`               | Fusion weight applied to semantic scores (default 0.7)                    |
| `prosodyWeight`   | `number`               | Fusion weight applied to prosody/audio scores (default 0.3)               |
| `modelVersion`    | `string`               | Pipeline version identifier (e.g. `"0.2.0-multimodal"`)                   |
| `errorMessage`    | `string`               | Present only when `status=failed`                                         |

## MVP Boundaries

### Included

- Single-user journaling (no auth)
- Portuguese-first transcription (Whisper) and multimodal emotion analysis (text + audio models)
- Local Docker Compose stack for development
- Audio-only input (no text entries)
- Rule-based recommendation ranking with optional LLM rationale enrichment (HF Inference API)
- Full Docker containerization

### Excluded

- Multi-user authentication
- Social sharing features
- Advanced crisis intervention flows
- Production cloud deployment
- Fine-tuned emotion models (using pre-trained HuggingFace)
- Advanced encryption or compliance certifications

## Development Workflow

1. **Local machine**: Run `docker compose up --build`
2. **Auto-reload**: Frontend (Next.js dev), Node (nodemon/ts-node), Python (FastAPI reload)
3. **Logs**: `docker compose logs -f <service-name>`
4. **Database**: Access via pgAdmin (http://localhost:5051) or `psql` CLI
5. **Storage**: MinIO console (http://localhost:9001)

## Performance Targets (MVP)

- **Recording to submission**: < 2 seconds
- **Analysis latency** (upload to results): 20–60 seconds for ~30s audio
- **Dashboard load time**: < 500ms after cache warm
- **Chart render time**: < 1 second (7 days of data)
- **Recommendation generation**: < 5 seconds per day

## Scalability Notes (Post-MVP)

- Larger Whisper models or fine-tuned emotion classifiers
- ElasticSearch for transcript full-text search
- Redis cluster for queue distribution
- PostgreSQL read replicas or caching layer
- S3 instead of MinIO for audio storage
- Kubernetes orchestration in place of Docker Compose
- User authentication and multi-tenancy schema

## Security Considerations (MVP)

- Local environment only (no network exposure)
- No encryption-at-rest (acceptable for local MVP)
- JWT tokens expire after 24 hours (placeholder auth)
- CORS restricted to localhost
- Soft-delete for user records (audit trail)
- No sensitive data logging

## Key Design Decisions

1. **Split backend (Node + Python)**
   - Rationale: Decouples API orchestration from heavy ML workloads; enables independent scaling and language optimization.

2. **Keep all audio in MVP**
   - Rationale: Enables offline analysis, model debugging, and re-computation without data loss. Retention policy toggled later.

3. **Bull queue for async jobs**
   - Rationale: Proven resilience, retry/backoff logic, job persistence; simpler than Celery for MVP scale.

4. **Multimodal fusion (semantic 70% + audio emotion 30%)**
   - Rationale: Semantic text signals are more reliable for short clips; audio emotion model adds accent/dialect robustness and non-verbal cues. Weights are configurable constants (`SEMANTIC_WEIGHT`, `PROSODY_WEIGHT`) and can be tuned independently. Intermediate scores (`semanticScores`, `prosodyScores`) are stored for traceability and future re-weighting.

5. **Daily aggregation**
   - Rationale: Improves granularity and responsiveness for trend evolution and recommendation generation.

6. **No ML fine-tuning in MVP**
   - Rationale: Simplifies deployment; HuggingFace pretrained models sufficient for POC. User feedback collected for future training.

7. **Optional LLM recommendation enrichment**
   - Rationale: When `HF_API_TOKEN` is set, generation calls HuggingFace Inference API (default: `mistralai/Mistral-7B-Instruct-v0.3`) to produce Portuguese rationale and impact estimates. Falls back to deterministic rule-based rationale when token is absent, keeping the system fully functional without external API access.

## Monitoring & Observability

- Structured JSON logging in all services (correlated by trace ID)
- Health check endpoints every 10s (configurable backoff)
- Queue depth monitoring (alert if > 100 pending jobs)
- Model performance baselines (Whisper WER, emotion F1)
- Docker resource limits (CPU, memory) per container

---

**For detailed implementation phases, see [PHASED_PLAN.md](./PHASED_PLAN.md)**
