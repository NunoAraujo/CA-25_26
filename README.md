# Audio Journaling MVP

A Portuguese-first journaling platform where users record short daily audio entries, receive prosody and content-based emotional analysis, and get personalized self-regulation activity suggestions with visual emotional evolution trends.

## Architecture

### Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                  Next.js App Frontend                         │
│      (Tailwind v4, App Router, audio capture, charts)        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│               Node.js REST API Gateway                       │
│   (Auth, journal CRUD, upload orchestration, aggregations)   │
└────┬──────────────────────────────┬──────────────────────────┘
     │ Task Queue (Bull/Redis)      │ Scheduled Tasks
     │                              │ (Node-cron)
┌────▼──────────────────────────────▼──────────────────────────┐
│            Python FastAPI Analysis Engine                    │
│  (Transcription, prosody extraction, emotion fusion)         │
└────────────────────────┬──────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
┌────▼─────┐      ┌──────▼──────┐    ┌──────▼──────┐
│PostgreSQL│      │   MinIO      │    │   Redis    │
│ (metadata│      │ (audio store)│    │ (queue)    │
│ + trends)│      │              │    │            │
└──────────┘      └──────────────┘    └────────────┘
```

### Stack Components

- **Frontend:** Next.js 15, TailwindCSS 4, Recharts for visualization
- **API Backend:** Node.js 20 LTS, Express, TypeScript, Prisma ORM
- **Analysis Engine:** Python 3.11, FastAPI, OpenAI Whisper, transformers
- **Database:** PostgreSQL 16
- **Queue:** Redis 7 + Bull
- **Storage:** MinIO (S3-compatible local object storage)
- **Infrastructure:** Docker Compose

## MVP Scope

- Single-user (no auth)
- Portuguese-first transcription and emotion analysis
- Keep all raw audio (no retention deletion for MVP)
- Local Docker-based development
- End-to-end flow: record → transcribe → prosody extract → emotion classify → fuse → trend aggregation → recommendations

## Quick Start

### Prerequisites

```bash
# macOS with Homebrew
brew install docker node@20 python@3.11

# Ensure Docker Desktop is running
open /Applications/Docker.app
```

### Setup

```bash
# 1. Clone and navigate to workspace
cd /Users/nunoaraujo/MIA/CA/CA-25_26/CA-25_26

# 2. Copy environment template
cp .env.example .env

# 3. Initialize git
git init
git add .
git commit -m "Initial project skeleton"

# 4. Bring up Docker Compose services
docker compose up --build

# Services will be available at:
# - Frontend: http://localhost:5173
# - API: http://localhost:3000/api
# - Analysis: http://localhost:8000
# - MinIO Console: http://localhost:9001 (user: minioadmin / password: minioadmin)
# - pgAdmin: http://localhost:5050 (user: admin@example.com / password: admin)
```

### Verify Infrastructure

```bash
# Check all services are healthy
docker compose ps

# View logs for a specific service
docker compose logs -f api
docker compose logs -f analysis
docker compose logs -f postgres

# Stop and clean up
docker compose down
```

## Project Structure

```
.
├── frontend/                 # Next.js app with Tailwind v4
│   ├── app/
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page
│   │   └── globals.css      # Tailwind styles
│   ├── package.json
│   ├── Dockerfile
│   └── next.config.ts
├── api-node/                # Node.js Express API
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── workers/         # Queue consumers
│   │   ├── services/        # Business logic
│   │   └── index.ts         # Server entrypoint
│   ├── prisma/
│   │   └── schema.prisma    # Data model
│   ├── package.json
│   ├── Dockerfile
│   └── tsconfig.json
├── analysis-python/         # Python FastAPI analysis engine
│   ├── app/
│   │   ├── pipelines/       # Transcription, prosody, emotion
│   │   ├── services/        # Integration with MinIO, DB
│   │   └── main.py          # FastAPI entrypoint
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
├── infra/                   # Infrastructure scripts
│   └── postgres-init.sql    # Database initialization
├── docs/                    # Documentation
│   ├── contracts/           # API contracts (OpenAPI)
│   ├── schema.md            # Database schema docs
│   ├── architecture.md      # Architecture decisions
│   └── phased-plan.md       # Implementation phases
├── docker-compose.yml       # Service orchestration
├── .env.example             # Environment template
└── README.md                # This file
```

## Implementation Status

All phases complete. See [PHASED_PLAN.md](./docs/PHASED_PLAN.md) for detailed progress.

- ✅ Phase 1: Foundation & Infrastructure
- ✅ Phase 2: Data Model & API Contracts
- ✅ Phase 3: Audio Ingestion Pipeline
- ✅ Phase 4: Python Analysis Engine
- ✅ Phase 5: Trends & Recommendations
- ✅ Phase 6: Frontend Dashboard
- 🚀 Phase 7: Documentation & Deployment (current)

## Core User Workflows

### Workflow 1: Record & Upload Audio

1. Open frontend at `http://localhost:5173`
2. Click **"Iniciar Gravação"** button
3. Speak naturally for 5–60 seconds (diary entry, stream-of-consciousness)
4. Click **"Parar"** to stop recording
5. Click **"Enviar"** to upload
6. See status: audio being analyzed (queued → transcribing → analyzing → complete)
7. Once complete, view transcription and emotion scores (joy, sadness, anger, anxiety, calm, energy)

### Workflow 2: View Weekly Trends & Recommendations

1. After completing multiple journal entries (ideally over several days)
2. Scroll to **"Evolução Emocional Semanal"** section
3. Click **"Gerar Recomendações Semanais"** button (computes weekly average emotions)
4. System generates 5–10 personalized recommendations based on emotional profile
5. Each recommendation shows:
   - Activity name (e.g., "Respiração Caixa 4-4-4-4")
   - Duration (5–20 min)
   - Target emotion & intensity
   - Rationale (why recommended)
   - Confidence score

### Workflow 3: Interact with Recommendations

1. Click **"Marcar como Feita"** on a completed activity → records completion
2. Provide feedback: **Positivo** / **Neutro** / **Negativo**
3. System learns from feedback → influences next week's recommendations
4. Filter recommendations by emotion or intensity using sidebar controls
5. Use quick presets: "Calming", "Energizing", "Short" to prefill filters

### Workflow 4: Explore Journal Timeline

1. Scroll to **"Histórico de Entradas"** section
2. See all journal entries (newest first) with:
   - Date/time recorded
   - Duration in seconds
   - Primary emotion + secondary emotion
   - Transcription preview (first 100 chars)
   - Status badge (complete/failed)
3. Click entry to expand and view:
   - Full transcription
   - 6-dimension emotion breakdown
   - Prosody metrics (pitch, energy, speech rate, etc.)
   - Audio metadata

## API Quick Reference

For programmatic access, key endpoints:

```bash
# Upload audio
curl -X POST http://localhost:3000/api/journals \
  -F "audio=@your_audio.wav;type=audio/wav" \
  -F "durationSeconds=30"

# Check status
curl http://localhost:3000/api/journals/{id}/status

# Get weekly trends
curl http://localhost:3000/api/trends/weekly

# Generate recommendations
curl -X POST http://localhost:3000/api/recommendations/generate-weekly

# Get recommendations
curl http://localhost:3000/api/recommendations

# Mark recommendation done
curl -X POST http://localhost:3000/api/recommendations/{id}/complete

# Send feedback
curl -X POST http://localhost:3000/api/recommendations/{id}/feedback \
  -H "Content-Type: application/json" \
  -d '{"feedback": "positive"}'
```

See [API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) for comprehensive endpoint reference.

## Privacy & Compliance

**MVP Policy:**

- Audio storage: MinIO local (unencrypted, acceptable for local MVP)
- Retention: Keep all audio for MVP (supports re-analysis and debugging)
- Deletion: Soft-delete endpoint available; hard-delete as admin operation
- Logs: Structured logs, no audio content logged
- GDPR/CCPA: Will be addressed in production hardening phase

## Resources

- [Architecture Decisions](/docs/ARCHITECTURE.md)
- [Database Schema](/docs/schema.md)
- [API Contracts](/docs/contracts/)
- [Phased Implementation Plan](/docs/PHASED_PLAN.md)

## License

[To be determined]

## Support

For issues or questions, refer to the documentation or check service logs via Docker Compose.
