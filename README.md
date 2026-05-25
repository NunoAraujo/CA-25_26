# Audio Journaling MVP

A Portuguese-first journaling platform where users record short daily audio entries, receive prosody and content-based emotional analysis, and get personalized self-regulation activity suggestions with visual emotional evolution trends.

## Architecture

### Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                  Next.js App Frontend                       │
│      (Tailwind v4, App Router, audio capture, charts)       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│               Node.js REST API Gateway                      │
│   (Auth, journal CRUD, upload orchestration, aggregations)  │
└────┬──────────────────────────────┬─────────────────────────┘
     │ Task Queue (Bull/Redis)      │ Scheduled Tasks
     │                              │ (Node-cron)
┌────▼──────────────────────────────▼─────────────────────────┐
│            Python FastAPI Analysis Engine                   │
│  (Transcription, prosody extraction, emotion fusion)        │
└────────────────────────┬────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
┌────▼─────┐      ┌──────▼───────┐    ┌──────▼─────┐
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

### Setup

```bash
# 1. Clone and navigate to workspace
cd .../CA-25_26

# 2. Copy environment template
cp .env.example .env

# 3. Bring up Docker Compose services
docker compose up --build

# Services will be available at:
# - Frontend: http://localhost:5173
# - API: http://localhost:3000/api
# - API Worker: background service (no public port)
# - Analysis: http://localhost:8000
# - Ollama: http://localhost:11434
# - Redis: redis://localhost:6379
# - PostgreSQL: postgresql://user:password@localhost:5432/journaling_db
# - MinIO API: http://localhost:9000
# - MinIO Console: http://localhost:9001 (user: minioadmin / password: minioadmin)
# - pgAdmin: http://localhost:5051 (user: admin@example.com / password: admin)
```

### Docker Compose Services

The `docker-compose.yml` stack includes these services:

- **frontend** (`journaling-app-frontend`) - Next.js UI, port `5173`
- **api** (`journaling-app-api`) - Node.js REST API, port `3000`
- **api-worker** (`journaling-app-api-worker`) - Bull queue worker for analysis jobs
- **analysis** (`journaling-app-analysis`) - Python FastAPI analysis engine, port `8000`
- **ollama** (`journaling-app-ollama`) - local LLM runtime for text emotion analysis, port `11434`
- **postgres** (`journaling-app-postgres`) - PostgreSQL database, port `5432`
- **redis** (`journaling-app-redis`) - Redis queue/cache backend, port `6379`
- **minio** (`journaling-app-minio`) - object storage API on `9000`, console on `9001`
- **pgadmin** (`journaling-app-pgadmin`) - DB administration UI, port `5051`

### Verify Infrastructure

```bash
# Check all services are healthy
docker compose ps

# View logs for a specific service
docker compose logs -f api
docker compose logs -f api-worker
docker compose logs -f analysis
docker compose logs -f ollama
docker compose logs -f redis
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
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/            # React hooks
│   │   ├── lib/              # Frontend utilities
│   │   └── types/            # Frontend types
│   ├── package.json
│   ├── Dockerfile
│   └── next.config.ts
├── api-node/                # Node.js Express API
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── workers/         # Queue consumers
│   │   ├── lib/             # Shared libs (Prisma, Redis, MinIO, etc.)
│   │   ├── scripts/         # Utility scripts
│   │   └── index.ts         # Server entrypoint
│   ├── prisma/
│   │   └── schema.prisma    # Data model
│   ├── package.json
│   ├── Dockerfile
│   └── tsconfig.json
├── analysis-python/         # Python FastAPI analysis engine
│   ├── app/
│   │   ├── models/          # Pydantic schemas and task models
│   │   ├── services/        # Analysis orchestration and callbacks
│   │   └── main.py          # FastAPI entrypoint
│   ├── notebooks/           # Analysis and pipeline notebooks
│   ├── scripts/             # Benchmark/support scripts
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
├── infra/                   # Infrastructure bootstrap scripts
│   ├── ollama-init.sh       # Pull/init Ollama model on startup
│   └── postgres-init.sql    # Database initialization SQL
├── docs/                    # Documentation
│   ├── contracts/           # API contracts (OpenAPI)
│   │   ├── analysis-api.yaml
│   │   └── node-api.yaml
│   ├── images/
│   └── report/
├── tests/                   # Experiment notebooks and model artifacts
│   ├── final/
│   ├── prosody/
│   ├── text/
│   └── whisper/
├── docker-compose.yml       # Service orchestration
├── .env.example             # Environment template
└── README.md                # This file
```
