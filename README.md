# Audio Journaling MVP

A Portuguese-first journaling platform where users record short daily audio entries, receive prosody and content-based emotional analysis, and get personalized self-regulation activity suggestions with visual emotional evolution trends.

## Architecture

### Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    React SPA Frontend                        │
│         (Tailwind, Vite, audio capture, charts)              │
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

- **Frontend:** React 18, Vite, TailwindCSS 3, Recharts for visualization
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
├── frontend/                 # React SPA with Tailwind
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # React hooks
│   │   └── App.tsx          # Main app
│   ├── package.json
│   ├── Dockerfile
│   └── vite.config.ts
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

## Development Workflow

### Phase 1: Foundation (Current)
- [x] Monorepo structure bootstrap
- [ ] Docker Compose with all services
- [ ] Environment templates and health checks
- [ ] Validate startup and dependency order

### Phase 2: Data Model & Contracts
- [ ] PostgreSQL schema design
- [ ] API contract definitions
- [ ] Service integration contracts

### Phase 3: Ingestion Pipeline
- [ ] Frontend audio recording/upload
- [ ] Node multipart upload endpoint
- [ ] Redis queue integration
- [ ] Job status lifecycle

### Phase 4: Analysis Engine
- [ ] Whisper transcription (Portuguese)
- [ ] Prosody feature extraction
- [ ] Emotion classification
- [ ] Fusion and callback

### Phase 5: Trends & Recommendations
- [ ] Weekly aggregation scheduler
- [ ] Recommendation engine logic
- [ ] Personalization rules
- [ ] API endpoints

### Phase 6: Frontend Dashboard
- [ ] Emotion evolution chart
- [ ] Recommendations panel
- [ ] Journal timeline
- [ ] Mobile-first responsive UX

### Phase 7: QA & Hardening
- [ ] Integration tests
- [ ] Model smoke tests
- [ ] Structured logging
- [ ] Privacy/deletion controls

## Privacy & Compliance

**MVP Policy:**
- Audio storage: MinIO local (unencrypted, acceptable for local MVP)
- Retention: Keep all audio for MVP (supports re-analysis and debugging)
- Deletion: Soft-delete endpoint available; hard-delete as admin operation
- Logs: Structured logs, no audio content logged
- GDPR/CCPA: Will be addressed in production hardening phase

## Resources

- [Architecture Decisions](/docs/architecture.md)
- [Database Schema](/docs/schema.md)
- [API Contracts](/docs/contracts/)
- [Phased Implementation Plan](/docs/phased-plan.md)

## License

[To be determined]

## Support

For issues or questions, refer to the documentation or check service logs via Docker Compose.
