# Database Schema (Phase 2)

This schema is defined in Prisma at `api-node/prisma/schema.prisma`.

## Core Models

- User
- Journal
- ProsodyFeature
- WeeklyTrend
- Recommendation
- JournalSuggestion
- ActivityLibrary
- ModelMetrics

## Journal Lifecycle

`queued -> transcribing -> analyzing -> complete | failed`

## Emotion Vector Fields

- `joyScore`
- `sadnessScore`
- `angerScore`
- `anxietyScore`
- `calmScore`
- `energyScore`

All emotion scores are normalized to the [0, 1] range.

## Indexing Strategy

- Journal by `(userId, uploadedAt)`
- Journal by `status`
- WeeklyTrend by `(userId, weekStart)`
- Recommendation by `(userId, weeklyTrendId)` and `activityId`

## Notes

- The schema is single-user compatible today and multi-user ready.
- `ActivityLibrary` stores recommendation activity templates.
- `ModelMetrics` stores offline model quality and latency snapshots.
