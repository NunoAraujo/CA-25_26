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
   - Handles weekly aggregation and recommendation generation
   - Connects to PostgreSQL for persistence

3. **Analysis Engine (Python + FastAPI)**
   - Accepts audio analysis jobs from Node API
   - Runs Whisper transcription (Portuguese-first)
   - Extracts prosody features and semantic emotions
   - Fuses results and callbacks to Node
   - Isolated from frontend to optimize for ML model loading

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
Python: Whisper → prosody extract → emotion classify → fuse
         ↓
Python POSTs results to Node callback endpoint
         ↓
Node updates Journal record with emotions + prosody features
         ↓
Weekly scheduler computes trends and recommendations
         ↓
Frontend polls GET /api/trends/weekly and /api/recommendations
         ↓
Dashboard displays charts + activity suggestions
```

## Technology Stack

| Layer    | Component        | Technology                      |
| -------- | ---------------- | ------------------------------- |
| Frontend | Framework        | Next.js 15 + TypeScript         |
|          | Build Tool       | Next.js runtime/build pipeline  |
|          | Styling          | Tailwind CSS 4                  |
|          | State            | Zustand                         |
|          | Charts           | Recharts                        |
|          | HTTP             | Axios + React Query             |
| API      | Runtime          | Node.js 20 LTS                  |
|          | Framework        | Express 4                       |
|          | Language         | TypeScript 5                    |
|          | ORM              | Prisma 5                        |
|          | Queue            | Bull 4 (Redis backend)          |
|          | Logging          | Pino 8                          |
| Analysis | Runtime          | Python 3.11                     |
|          | Framework        | FastAPI 0.109                   |
|          | Transcription    | OpenAI Whisper                  |
|          | Audio Processing | librosa 0.10                    |
|          | ML               | transformers 4.37 (HuggingFace) |
| Data     | Database         | PostgreSQL 16                   |
|          | Cache/Queue      | Redis 7                         |
|          | Storage          | MinIO (S3-compatible)           |
| Infra    | Orchestration    | Docker Compose 3.9              |
|          | Containers       | Docker                          |

## Database Schema (Phase 2 Detail)

### Core Entities

- **User** – Single-user MVP placeholder
- **Journal** – Audio entry with status lifecycle
- **ProsodyFeature** – Extracted pitch, energy, speech features
- **WeeklyTrend** – Aggregated emotion scores and volatility
- **Recommendation** – Personalized activity suggestions
- **ActivityLibrary** – Available self-regulation activities
- **EditorRecommendation** – Per-journal recommendation context

### Key Fields

- **Emotion Scores** – Normalized 0..1 for: joy, sadness, anger, anxiety, calm, energy
- **Status Lifecycle** – queued → transcribing → analyzing → complete → failed
- **Metadata** – Timestamps, user feedback, model version, trace IDs

## API Contracts (Phase 2 Detail)

### Node.js Frontend API

```
POST   /api/journals                  # Upload audio
GET    /api/journals                  # List entries
GET    /api/journals/{id}             # Get entry details
DELETE /api/journals/{id}             # Delete entry
GET    /api/journals/{id}/status      # Poll job status
GET    /api/trends/weekly             # Weekly emotion evolution
GET    /api/recommendations           # Get activities
POST   /api/recommendations/{id}/feedback # Rate recommendation
GET    /api/health                    # Service health
```

### Python Analysis API (Node calling)

```
POST   /api/v1/analyze                # Submit analysis job
GET    /api/v1/analyze/{taskId}       # Poll analysis status
POST   /api/journals/{journalId}/analysis-callback  # Python posts results back
GET    /health                        # Service health
```

## MVP Boundaries

### Included

- Single-user journaling (no auth)
- Portuguese-first transcription and emotion analysis
- Local Docker Compose stack for development
- Audio-only input (no text entries)
- Basic heuristic-based recommendations (not ML-trained)
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
- **Recommendation generation**: < 5 seconds per week

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

4. **Prosody + semantic fusion (30/70 split)**
   - Rationale: Semantic signals more reliable for short clips; prosody adds accent/dialect robustness. Tuning weights in Phase 5.

5. **Weekly-only aggregation**
   - Rationale: Reduces computation; daily data remains queryable from Journal records. Upgrade to real-time if needed.

6. **No ML fine-tuning in MVP**
   - Rationale: Simplifies deployment; HuggingFace pretrained models sufficient for POC. User feedback collected for future training.

## Monitoring & Observability

- Structured JSON logging in all services (correlated by trace ID)
- Health check endpoints every 10s (configurable backoff)
- Queue depth monitoring (alert if > 100 pending jobs)
- Model performance baselines (Whisper WER, emotion F1)
- Docker resource limits (CPU, memory) per container

---

**For detailed implementation phases, see [PHASED_PLAN.md](./PHASED_PLAN.md)**
