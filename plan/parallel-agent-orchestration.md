# Parallel Agent Orchestration Plan (Integration-First)

## Goal
Ship an integrated, demo-ready pipeline quickly. Prefer thin interfaces, isolated modules, and testable checkpoints over perfect architecture.

## Isolation Strategy (Non-Interfering File Structure)
All parallel work lands in new, namespaced directories to avoid conflicts.

- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/contracts.ts
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/fixtures/complaints.json
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/complaint-intake/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/investigation/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/variant-generator/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/experiment-runner/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/llm-judge/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/expert-eval/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/modules/report/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/lib/vibes/pipeline.ts
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/app/api/vibe/
- /Users/shawnesquivel/GitHub/codex-vibe-prompter/src/app/(vibe)/

## Simple Integration Points
Use only these integration points so agents can work in parallel without stepping on each other.

- Contract boundary: `contracts.ts` defines all input and output types and minimal module signatures.
- Module boundary: each module exposes `run(input, ctx)` from its own `index.ts` file.
- Pipeline boundary: `pipeline.ts` wires modules together in order.
- API boundary: `/api/vibe/*` routes call the pipeline and return JSON.
- UI boundary: `/app/(vibe)/*` pages call the API routes.

## Parallel Agent Assignments
Each agent owns a non-overlapping slice of the tree.

- Agent A: Contracts and fixtures. Owns `contracts.ts`, `fixtures/`, and light validation helpers.
- Agent B: Core pipeline. Owns `pipeline.ts` and the module calling order.
- Agent C: OpenAI modules. Owns investigation, variant generator, experiment runner, judge.
- Agent D: Expert evaluation and report modules. Owns expert-eval and report.
- Agent E: UI pages and API routes. Owns `/app/(vibe)` and `/app/api/vibe`.

## Module Milestones and Tests
Milestones are “works in isolation with mocks” first, then “wired into pipeline”, then “exposed in API”.

### Module 1: Complaint Intake
- Integration: `fixtures/complaints.json` loaded by `complaint-intake/run`.
- Pipeline: first stage in `pipeline.ts`.
- Test: `node scripts/test-complaint-intake.mjs` reads fixtures and validates schema.
- If blocked: stop the loop and ask human to open the dashboard and confirm complaint list renders.

### Module 2: Investigation Engine
- Integration: `investigation/run` consumes complaint + transcript + system prompt.
- Pipeline: second stage in `pipeline.ts`.
- Test: `node scripts/test-investigation.mjs` with a mocked OpenAI response fixture.
- If blocked: stop the loop and ask human to run `/api/vibe/investigation` and verify JSON shape.

### Module 3: Variant Generator
- Integration: `variant-generator/run` consumes investigation output and returns 3 variants.
- Pipeline: third stage in `pipeline.ts`.
- Test: `node scripts/test-variants.mjs` uses a mocked OpenAI response fixture.
- If blocked: stop the loop and ask human to confirm 3 variants render in experiment view.

### Module 4: Experiment Runner
- Integration: `experiment-runner/run` replays conversation with each variant.
- Pipeline: fourth stage in `pipeline.ts`.
- Test: `node scripts/test-experiment-runner.mjs` uses mocked responses and checks metrics output.
- If blocked: stop the loop and ask human to run `/api/vibe/experiment` and confirm metrics show.

### Module 5: LLM-as-Judge
- Integration: `llm-judge/run` scores outputs from experiment runner.
- Pipeline: fifth stage in `pipeline.ts`.
- Test: `node scripts/test-judge.mjs` uses mocked judge scores.
- If blocked: stop the loop and ask human to verify judge scores appear in experiment results.

### Module 6: Expert Evaluation (TestFlight)
- Integration: `expert-eval/run` prepares shareable routes and payload.
- UI: `/evaluate/[id]/[variant]` reads payload from API.
- Test: `node scripts/test-expert-eval.mjs` validates link shapes and payload shape.
- If blocked: stop the loop and ask human to open a shareable link and confirm the rating form.

### Module 7: Report and Winner Selection
- Integration: `report/run` merges metrics and ratings into a summary.
- Pipeline: final stage in `pipeline.ts`.
- Test: `node scripts/test-report.mjs` runs with synthetic inputs and checks winner logic.
- If blocked: stop the loop and ask human to confirm the comparison table renders.

## How It Integrates Into the App
- Dashboard page: reads `fixtures/complaints.json` for list view.
- Experiment page: calls `/api/vibe/experiment` which uses `pipeline.ts`.
- Evaluation page: calls `/api/vibe/evaluation` or reads embedded payload via route params.

## Hackathon Constraints
- Prefer mocked OpenAI fixtures during development.
- Use real OpenAI calls only in the final pipeline pass.
- If a test requires real API keys or user interaction, stop the loop and ask the human to run it.

## Final Integration Checklist
- `contracts.ts` is the single source of truth for I/O shapes.
- Each module has `run()` and a mockable path.
- `pipeline.ts` composes modules in PRD order.
- API routes return JSON that matches the contracts.
- UI renders without direct OpenAI calls.
