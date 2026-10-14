# STATE — 2026-10-14

## Current branch
`arena/5d0e28b1-konklancer` (session-fixed; push only here).

## User goal and blockers
User wants the personal app actually usable in this sandbox, especially **fresh scanning + real AI**.
User explicitly selected **no provider key and no running gateway**. Do not describe AI as enabled.
The environment's outbound allowlist does not include LLM providers or the freelance sites.
GitHub cloud scanning is now verified working. AI still requires a provider account/key and a reachable deployment path.
GitHub Models is not an alternative: official github/docs content says retired July 30, 2026.
Gateway repo `reARbitRA/konkred-AI-ecosystem` is public, but code is not credentials. No keys were found or requested in chat.

## Verified implementation
- SPEC-003 R5: Bearer auth for all `/api/*`, Socket.io handshake token, sessionStorage login gate + lock button, same-origin API helper. No-token development binds loopback; production refuses startup without token. Tokens are never bundled or committed.
- SPEC-004: scanner regression test corrected for a real listing without a public budget. Live captures go to artifacts rather than overwriting regression fixtures. Workflow concurrency is per branch.
- Cloud UI waits for a **fresh** finished result (server `since`), checks workflow failure, rejects duplicate requests, and doesn't show stale success on timeout.
- When cloud config is enabled, the UI's normal scan button routes to the cloud scan.
- Runtime preview: production Express + static frontend + Socket.io on port 3000. `.env`, data/projects.jsonl and access instructions in data/PREVIEW-ACCESS.md are private/ignored, not durable configuration. Restore these after sandbox rebuild if absent.
- Cloud feed configured for this branch only, with existing sandbox GitHub authentication (no stored/copied GitHub token).

## Verification
- `npm test`: 29/29.
- `npm run lint`: pass after installing the separate mobile dependencies with `npm ci --prefix mobile --legacy-peer-deps` (root tsc includes the mobile config).
- `npm run build`: pass, existing chunk-size/Vite warnings remain.
- `npm run test:scanner`: 54/54.
- Live HTTP: public login HTML 200; unauthenticated API 401; authorized 152-job scanner feed; cloud status + sync 200; unknown API 404; AI 503 AI_NOT_CONFIGURED (honest blocker).
- Authenticated live Socket.io handshake passed; auth tests cover websocket and polling rejection/acceptance.
- Cloud run 38549319588: success, **61 records read** (parscoders 23, telegram:workarc 18, telegram:freelancer_projects 20), 152 cumulative records. Ponisha/Karlancer listing paths returned 404.
- App-triggered end-to-end run 38550794363 succeeded after `/api/bridge/cloud-scan`; duplicate request correctly rejected with 409. Auto-sync delivered **154** cumulative jobs with scrapedAt newer than request. No manual sync was needed.

## Remaining scope / specs
- SPEC-001/002/007 still DRAFT; no blanket claim that all their functionality is complete.
- SPEC-003 R7 legacy engine deletion still awaits owner decision. Never run it.
- SPEC-004 R7 Telegram notifications still open. Site coverage incomplete.
- SPEC-005 SQLite/outcome tracking still OPEN; pipeline state remains localStorage.
- SPEC-006 actual provider inference is BLOCKED, not verified live. Do not substitute mock answers.
- CodeWorkspace test button still simulated; do not claim generated code was executed.
- Preview isn't permanent hosting. Mobile npm audit reported 3 moderate issues (separate wrapper, not production web dependencies).
