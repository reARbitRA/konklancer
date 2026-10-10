# STATE — as of 2026-10-10
## Milestone: M1 (Features) + Safety hardening + LLM gateway
## Specs
- SPEC-001, SPEC-002: DRAFT (unchanged)
- SPEC-003 Safety & Hardening: APPROVED (T-003 DOING; R5 API auth and R7 (delete engine file) open)
- SPEC-004 Live Feed from Scanner: APPROVED (T-004 OPEN; only R1 done)
- SPEC-005 Outcome Tracking: APPROVED (T-005 OPEN)
- SPEC-006 LLM via Konkred gateway: APPROVED (T-006 DONE; PII redaction recommendation not approved)
## Decisions (user, 2026-10-10)
- Gemini removed from konklancer only; gateway keeps it. Privacy default: any. Fusion = gateway normalization, not ensemble.
- freelance_pro_engine.py: undecided; the user asked why deletion is needed. Untouched, never run.
## Next up (ordered)
1. Ask: is the repo public? Then decide freelance_pro_engine.py.
2. T-003 R5: KONKRED/KONKLANCER API auth on /api/* (needs frontend header).
3. T-004: scanner JSONL → /api/jobs, rule pre-filter (before callLLM), tiered taskType usage.
4. T-005: SQLite, bid outcomes, win-rate stats.
## Known issues
- npm install needs --legacy-peer-deps (esbuild peer conflict, pre-existing).
- Sandbox environment was reset once: local git history had been rewound to 6d95b37; repaired by aligning to origin (1dd2b57 branch tip, before decisions commit).
