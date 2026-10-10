# TRACE
## Traceability Matrix
- SPEC-003 R1 → GitHubDispatcher.tsx (isPrivate default true)
- SPEC-003 R2 → App.tsx settings/sessionStorage
- SPEC-003 R3 → server/contentFilter.ts, server.ts analyze-job / generate-proposal / generate-solution
- SPEC-003 R4 → server.ts DEFAULT_JOBS, src/data/mockJobs.ts
- SPEC-003 R6 → App.tsx autoStart={false}
- SPEC-004 R1 → server.ts DEMO_FEED
- SPEC-003 R5, R7 → not yet (T-003 / Q1)
- SPEC-006 → server/llm.ts (callLLM, isMockModel, readLLMConfig), server/llm.test.ts (7 tests), server.ts (4 call sites, sendLLMError), .env.example
- SPEC-006 R4 (mock guard) → server/llm.ts isMockModel + test "mock simulator answer is rejected"
- SPEC-006 R7 (cache) → server/llm.ts cacheKey + test "cacheKey"
- SPEC-006 R5 (retry) → server/llm.ts loop + test "429 is retried"
