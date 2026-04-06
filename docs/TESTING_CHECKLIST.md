# Testing & Validation Checklist

This checklist guides manual testing and validation of the Audio Journaling MVP. All tests use real data collected during manual testing—no seeded demo data.

## Pre-Flight Checks

### Infrastructure Verification

- [ ] Docker Desktop is running (`open /Applications/Docker.app`)
- [ ] All services are healthy: `docker compose ps` shows all containers in "healthy" state
- [ ] API responds: `curl http://localhost:3000/api/health` returns `"status": "healthy"`
- [ ] Analysis service responsive: `curl http://localhost:8000/health` returns status 200
- [ ] Frontend loads: `http://localhost:5173` displays the dashboard
- [ ] Database migrations applied: `docker compose logs api | grep "migrations applied"`

### Network Connectivity

- [ ] Frontend can reach API: browser DevTools Network tab shows `/api/` calls succeeding
- [ ] API can reach analysis service: `docker compose logs api-worker | grep -i "analysis"` shows connection attempts
- [ ] API can reach MinIO: `docker compose logs api | grep -i "minio"` shows no errors
- [ ] API can reach PostgreSQL: `docker compose logs api | grep -i "database"` shows successful connection

---

## Phase 1: Audio Recording & Upload

### Basic Recording

- [ ] Click "Iniciar Gravação" button—timer starts at 00:00
- [ ] Speak naturally for 10–20 seconds
- [ ] Timer increments correctly
- [ ] Click "Parar"—recording stops, timer freezes
- [ ] Audio waveform/visual feedback displayed (if implemented)

### Upload & Status Polling

- [ ] Click "Enviar"—file uploads to server
- [ ] Response includes `journalId` in UI or console
- [ ] Status shown as "queued" or "transcribing"
- [ ] Poll journal status with: `curl http://localhost:3000/api/journals/{id}/status`
- [ ] Status transitions: `queued` → `transcribing` → `analyzing` → `complete`
- [ ] Each transition takes 2–10 seconds (depending on audio length & system load)
- [ ] Toast notification appears when analysis completes ("Entrada analisada com sucesso")

### Error Handling

- [ ] Upload fails gracefully if network disconnects (retry logic shown)
- [ ] Invalid file format rejected with user-visible error
- [ ] Oversized audio (>10MB) rejected with size limit message
- [ ] Failed analysis shows error notification ("Análise falhou, tente novamente")

---

## Phase 2: Analysis Results & Journal Details

### Viewing Transcription & Emotions

- [ ] After completion, journal shows full transcription text
- [ ] 6 emotion dimensions displayed:
  - [ ] Joy (0.0–1.0)
  - [ ] Sadness (0.0–1.0)
  - [ ] Anger (0.0–1.0)
  - [ ] Anxiety (0.0–1.0)
  - [ ] Calm (0.0–1.0)
  - [ ] Energy (0.0–1.0)
- [ ] Emotions sum roughly to 1.0 (normalized)
- [ ] Primary emotion highlighted (highest score)
- [ ] Emotion values are reasonable given transcription content

### Journal Timeline

- [ ] All uploaded journals appear in "Histórico de Entradas" timeline
- [ ] Newest first (reverse chronological order)
- [ ] Each entry shows:
  - [ ] Date and time (ISO format or localized)
  - [ ] Duration in seconds
  - [ ] Status badge (green checkmark for "complete")
  - [ ] Transcription preview (first ~100 characters)
  - [ ] Primary + secondary emotion labels
- [ ] Click entry to expand and see full details:
  - [ ] Complete transcription
  - [ ] All 6 emotion scores
  - [ ] Prosody features (if available):
    - [ ] Mean pitch (Hz)
    - [ ] Energy variance
    - [ ] Speech rate (words/min)
    - [ ] Pause ratio
    - [ ] MFCC features

### Data Persistence

- [ ] Refresh browser (F5)—all journals still visible
- [ ] Restart Docker Compose—journals still present in database
- [ ] Verify in pgAdmin: `SELECT COUNT(*) FROM "Journal"` shows correct count

---

## Phase 3: Weekly Trends & Visualization

### Generating Weekly Trends

- [ ] Add at least 3–5 journal entries over multiple days (vary emotions: happy entry, anxious entry, etc.)
- [ ] Scroll to "Evolução Emocional Semanal" section
- [ ] Click "Gerar Recomendações Semanais" button
- [ ] Toast appears: "Gerando recomendações..." then "Recomendações atualizadas!"
- [ ] Request logs: `curl -X POST http://localhost:3000/api/recommendations/generate-weekly | jq .`

### Chart Display

- [ ] Emotion evolution chart appears (Recharts ComposedChart)
- [ ] Chart shows 7 days (including today and past 6 days)
- [ ] 6 line series displayed (joy, sadness, anger, anxiety, calm, energy)
- [ ] Each line has distinct color
- [ ] Hover over data point → tooltip shows date + all 6 values
- [ ] Trend arrows visible next to each emotion:
  - [ ] "up" arrow for increasing trend
  - [ ] "down" arrow for decreasing trend
  - [ ] "→" for stable

### Trend Calculation Validation

- [ ] Manual calculation: average emotion scores for the week
  - Example: If 4 entries with joy scores [0.7, 0.8, 0.6, 0.75] → avg ≈ 0.71
- [ ] Verify chart reflects this average
- [ ] Check delta cards (week-over-week change):
  - [ ] Correctly show +/- percentage or comparison text

### Data Persistence

- [ ] Refresh page—chart data persists
- [ ] Restart API—trends recalculated correctly
- [ ] Generate recommendations twice—should idempotent (same recommendations)

---

## Phase 4: Recommendations & Interaction

### Recommendation Display

- [ ] After trend generation, see **5–10 recommendations**
- [ ] Each recommendation card shows:
  - [ ] Activity name (Portuguese, e.g., "Respiração Caixa 4-4-4-4")
  - [ ] Duration (5, 10, 15, or 20 minutes)
  - [ ] Intensity badge (low/medium/high)
  - [ ] Target emotion (anxiety, sadness, joy, etc.)
  - [ ] Rationale text (reason why recommended)
  - [ ] Expected impact (confidence score 0.5–0.95)
  - [ ] "Marcar como Feita" button (mark as done)
  - [ ] Feedback buttons (Positivo / Neutro / Negativo)

### Filtering & Sorting

- [ ] Click "Intensity: Low" filter—recommendations filtered
- [ ] Click "Emotion: Anxiety"—filtered recommendations shown
- [ ] Click preset button "Calming"—filters set automatically
- [ ] Click preset "Energizing"—filters change
- [ ] Clear filters—all recommendations reappear

### Marking as Done

- [ ] Click "Marcar como Feita" on a recommendation
- [ ] Button changes appearance (disabled or checkmark shown)
- [ ] Toast notification: "Atividade marcada como concluída!"
- [ ] Verify in database: `SELECT "completedAt" FROM "Recommendation" WHERE id = '...'` shows timestamp

### Feedback Submission

- [ ] Click "Positivo" on a recommendation
- [ ] Button highlights (visual feedback)
- [ ] Toast: "Feedback registrado!"
- [ ] Click "Neutro" on another
- [ ] Click "Negativo" on third
- [ ] Verify in database: `SELECT "feedbackValue" FROM "Recommendation"` shows mixed feedback

### Recommendation Persistence

- [ ] Refresh page—same recommendations visible
- [ ] Completion status + feedback persisted
- [ ] Regenerate recommendations—new ones potentially appear based on feedback history

---

## Phase 5: API Integration

### Journal Upload Endpoint

```bash
# Create test audio
python3 -c "
import math, wave, struct
sr = 16000
seconds = 3
freq = 440.0
amp = 0.3
w = wave.open('/tmp/test.wav', 'w')
w.setnchannels(1)
w.setsampwidth(2)
w.setframerate(sr)
w.writeframesraw(b''.join(struct.pack('<h', int(amp*32767*math.sin(2*math.pi*freq*i/sr))) for i in range(sr*seconds)))
w.close()
"

# Upload
curl -X POST http://localhost:3000/api/journals \
  -F "audio=@/tmp/test.wav;type=audio/wav" \
  -F "durationSeconds=3"
```

- [ ] Response includes `id`, `status: "queued"`, `createdAt`
- [ ] Status code: 201 Created
- [ ] Audio file stored in MinIO (verify via MinIO console at http://localhost:9001)

### Status Polling

```bash
JOURNAL_ID="<id-from-above>"
curl http://localhost:3000/api/journals/$JOURNAL_ID/status
```

- [ ] Response includes `status` field
- [ ] Status progresses through states
- [ ] After completion, includes `transcription` and `emotionScores`

### Trends Endpoint

```bash
curl http://localhost:3000/api/trends/weekly
```

- [ ] Response includes `startDate`, `endDate`
- [ ] `dailyAverages` array has 7 entries
- [ ] Each day includes all 6 emotions + entry count
- [ ] `trendDirections` shows "up"/"down"/"stable" for each emotion

### Recommendations Endpoint

```bash
# Generate
curl -X POST http://localhost:3000/api/recommendations/generate-weekly

# Fetch
curl http://localhost:3000/api/recommendations
```

- [ ] Generate response includes `recommendations` array + `weeklyTrend`
- [ ] Fetch response includes array of current recommendations
- [ ] Each recommendation has `id`, `activityName`, `confidence`, `completedAt`, `feedbackValue`

### Feedback Endpoint

```bash
REC_ID="<recommendation-id>"
curl -X POST http://localhost:3000/api/recommendations/$REC_ID/feedback \
  -H "Content-Type: application/json" \
  -d '{"feedback": "positive"}'
```

- [ ] Response: `{"success": true}`
- [ ] Database updated: `SELECT "feedbackValue" FROM "Recommendation" WHERE id = '...'` shows "positive"

---

## Phase 6: Performance & Stability

### Response Times

- [ ] Upload endpoint: <2 seconds (frontend UI responsive)
- [ ] Status polling: <500ms (consistent queries)
- [ ] Trends calculation: <3 seconds (weekly aggregation)
- [ ] Recommendation generation: <5 seconds (rule evaluation)
- [ ] Feedback submission: <500ms

### Load Testing (Optional)

- [ ] Upload 10 journals in rapid succession
- [ ] System remains responsive
- [ ] No data corruption or duplicate entries
- [ ] All journals complete analysis within reasonable time

### Concurrent Operations

- [ ] Start 2 browser windows/tabs
- [ ] Upload audio in tab 1
- [ ] View timeline in tab 2 while analysis running
- [ ] Both tabs show consistent data
- [ ] No race conditions or UI glitches

### Error Recovery

- [ ] Stop analysis service: `docker compose stop analysis`
- [ ] Upload audio → status shows "failed" after retries
- [ ] Restart service: `docker compose up analysis`
- [ ] Retry upload → succeeds
- [ ] Previous failed entry still visible in timeline (with error status)

---

## Phase 7: Browser & UX

### Responsiveness

- [ ] Test on desktop (1920x1080)
- [ ] Test on tablet view (iPad, ~1024x768)
- [ ] Test on mobile (iPhone 12, ~390x844)
- [ ] All sections readable and clickable
- [ ] Buttons appropriately sized for touch
- [ ] Forms submit correctly on all sizes

### Accessibility

- [ ] Audio controls have visible play/stop indicators
- [ ] Record button clearly indicates recording state
- [ ] Emotion scores readable with good contrast
- [ ] Toast notifications visible and readable
- [ ] Navigation smooth and intuitive

### Browser Compatibility

- [ ] Test on Chrome/Chromium
- [ ] Test on Safari (if on macOS)
- [ ] Test on Firefox
- [ ] Audio recording works consistently
- [ ] No console errors (open DevTools, check Console tab)

### Notifications & Feedback

- [ ] Toast notifications appear for:
  - [ ] Upload started
  - [ ] Analysis complete
  - [ ] Activity marked done
  - [ ] Feedback submitted
  - [ ] Recommendations generated
- [ ] Toasts auto-dismiss after 3–5 seconds
- [ ] Color scheme indicates success (green), error (red), info (blue)

---

## Phase 8: Documentation & Final Checks

### README Verification

- [ ] Quick Start section works (docker compose up --build)
- [ ] API reference gives correct endpoint URLs
- [ ] Architecture diagram is clear and accurate
- [ ] File structure matches actual codebase

### API Documentation

- [ ] All endpoints documented
- [ ] Request/response examples are valid
- [ ] cURL examples work as-is
- [ ] Error handling explained

### Code Quality

- [ ] No TypeScript errors: `npm --prefix frontend run type-check`
- [ ] No TS errors in API: `npm --prefix api-node run type-check`
- [ ] Frontend linting: `npm --prefix frontend run lint`
- [ ] API linting: `npm --prefix api-node run lint`

### Git Hygiene

- [ ] All changes committed
- [ ] Clean working tree: `git status` shows no uncommitted changes
- [ ] Meaningful commit messages
- [ ] Log history readable: `git log --oneline -10`

---

## Sign-Off Checklist

- [ ] All sections above have been tested and passed
- [ ] Real data has been created and validated
- [ ] No demo/seed data used
- [ ] Performance acceptable for single-user MVP
- [ ] No critical bugs or data loss
- [ ] Documentation complete and accurate
- [ ] Codebase clean and well-formatted
- [ ] Ready for university presentation

---

## Known Limitations (MVP Scope)

- ✓ Single-user only (no multi-user support)
- ✓ No authentication required
- ✓ Audio kept indefinitely (no retention deletion)
- ✓ Portuguese language only
- ✓ Local Docker Compose deployment only (no cloud/remote)
- ✓ Lightweight transcription model (not full Whisper pipeline)
- ✓ Rule-based recommendations (not ML-trained)

---

## Troubleshooting

### If services don't start:

```bash
# Full restart
docker compose down -v
docker compose up --build

# Check individual service logs
docker compose logs -f api
docker compose logs -f analysis
docker compose logs -f postgres
```

### If audio analysis gets stuck:

```bash
# Check queue status
docker compose exec redis redis-cli
> LLEN bull-analysis:queue
> LLEN bull-analysis:failed

# Clear failed jobs (optional)
> DEL bull-analysis:failed
```

### If database looks corrupted:

```bash
# Reset database
docker compose down postgres
rm -rf data/postgres
docker compose up postgres
docker compose exec api npx prisma migrate deploy
```

### If frontend can't reach API:

- Verify API running: `curl http://localhost:3000/api/health`
- Check NEXT_PUBLIC_API_URL in `.env` = `http://localhost:3000`
- Restart frontend: `docker compose restart frontend`
