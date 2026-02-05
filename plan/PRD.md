# Vibe Check — AI Vibes Platform

## One-liner

A platform that turns subjective user complaints ("it feels robotic", "it's going in a loop") into structured prompt experiments with expert evaluation — because LLMs can't judge vibes, humans can.

---

## Assumptions

1. **The hardest AI quality problems are subjective.** Token counts and latency are easy to measure. "Feels soulless" is not. No existing eval framework handles this.
2. **Domain experts exist but lack tooling.** A therapist knows a response feels wrong. A lawyer knows the tone is off. They can't translate that into a prompt fix. We bridge that gap.
3. **The platform is domain-agnostic.** Customer support, legal, insurance, healthcare — any AI app with subjective quality issues can plug in. The demo uses customer support (safe, relatable).
4. **3 variants is the sweet spot.** Enough to compare meaningfully, few enough to evaluate without fatigue. Each uses a different GPT-5 prompting technique.
5. **Human-in-the-loop is the differentiator.** LLM-as-judge provides objective metrics. Expert evaluation via shareable "TestFlight" links provides subjective scoring. Combined = the full picture.
6. **No database for MVP.** Mock data in JSON. No auth. Local dev server. Ship the demo, not the infrastructure.
7. **OpenAI SDK only.** GPT-5 for investigation, variant generation, experiment execution, and LLM-as-judge. Claude is a stretch goal.

---

## Problem

Every AI team has this loop:

```
User complains → Dev guesses at prompt fix → Ships it → Hopes it's better → Repeat
```

Nobody measures. Nobody experiments. Nobody asks domain experts. The result: prompt engineering by vibes, with no data and no accountability.

This is especially painful in high-stakes domains (legal, insurance, healthcare) where "close enough" isn't good enough and developers lack the domain expertise to judge quality.

---

## Solution

Vibe Check replaces guessing with a structured experimentation workflow:

```
Complaint → Investigation → Hypothesis → 3 Variants → Metrics + Expert Eval → Winner
```

---

## Modules

### Module 1: Complaint Intake

**What it does:** Receives a user complaint linked to a conversation transcript.

**Input:**
- Complaint text (e.g., "The bot feels robotic when I'm upset about my refund")
- Conversation history (4-6 messages showing the problem)
- The system prompt that generated those responses

**Output:** A structured complaint object ready for investigation.

**For MVP:** 3 hard-coded complaint scenarios in a JSON file. Each maps to a different type of subjective quality issue:
- "Feels robotic / no empathy"
- "Keeps apologizing but never helps" (sycophantic loop)
- "Way too verbose, I just want a quick answer"

---

### Module 2: Investigation Engine

**What it does:** Analyzes a complaint to identify what's wrong with the current prompt and why.

**Input:** Complaint + conversation + system prompt

**Output:**
- Analysis: what pattern the AI exhibited (e.g., "excessive hedging, template-like responses")
- Hypothesis: which part of the system prompt is causing it (e.g., "no empathy instructions, over-emphasis on being helpful")
- Relevant prompt section: the specific lines that need attention

**Implementation:** Single OpenAI API call with an investigator system prompt. Returns structured JSON.

---

### Module 3: Variant Generator

**What it does:** Creates 3 improved prompt variants, each using a different technique from the GPT-5 Prompting Guide.

**Input:** Investigation results (analysis, hypothesis, original prompt)

**Output:** 3 variants, each with:
- Name and technique label (e.g., "Variant A: Metaprompting")
- The modified system prompt
- A human-readable description of what changed and why

**Variant strategies:**
- **Variant A — Metaprompting:** GPT-5 rewrites the prompt with minimal edits, explaining its reasoning
- **Variant B — Targeted Technique:** Applies a specific technique (verbosity control, agentic persistence, etc.) based on the complaint type
- **Variant C — Self-Reflection Rubric:** Adds a self-evaluation rubric so the AI checks its own output quality

**Implementation:** Single OpenAI API call that returns all 3 variants.

---

### Module 4: Experiment Runner

**What it does:** Runs all 3 variants against the same test inputs and collects objective metrics.

**Input:** 3 variant system prompts + the original user messages from the conversation

**Output per variant:**
- Full response text
- Token count (input + output)
- Estimated cost
- Wall-clock latency (ms)
- Response length (words)

**Implementation:** 3 parallel OpenAI API calls (`Promise.all`). Each replays the user messages with a different system prompt.

---

### Module 5: LLM-as-Judge

**What it does:** Scores each variant's responses on objective quality dimensions.

**Input:** Original complaint + each variant's responses

**Output per variant:**
- Quality score (0-10): helpfulness, accuracy, tone
- Complaint resolution score (0-10): did this variant fix the specific complaint?
- Conciseness score (0-10): appropriate length?

**Implementation:** 1 OpenAI API call per variant with a judge system prompt. Can run in parallel with experiment execution.

---

### Module 6: Expert Evaluation (TestFlight)

**What it does:** Generates shareable URLs where domain experts rate variants on subjective criteria that LLMs cannot judge.

**Input:** Experiment results

**Output:**
- 3 shareable links (one per variant): `/evaluate/[experimentId]/[variantId]`
- Each shows the test conversation with that variant's responses
- Rating form with 4 dimensions (1-5 scale):
  - **Helpfulness:** Did it actually solve the problem?
  - **Empathy:** Did it acknowledge the user's emotional state?
  - **Naturalness:** Did it feel like talking to a human?
  - **Resolution:** Would the user be satisfied?
- Optional comment field

**This is the differentiator.** No other tool does this. During the demo, we can hand the judges the 3 links and say "you tell us which is best."

---

### Module 7: Report & Winner Selection

**What it does:** Combines objective metrics + LLM judge scores + expert ratings into a final comparison.

**Input:** All metrics from modules 4, 5, 6

**Output:**
- Side-by-side comparison table with delta arrows (green = improved, red = regressed)
- Combined score: objective metrics (40%) + expert vibes (60%)
- Recommended winner with one-liner summary (e.g., "Variant B: 42% fewer tokens, empathy score 4.8/5, complaint resolved")
- Prompt diff view showing what changed

---

## UI Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | List of complaints with status badges |
| Experiment | `/experiment/[id]` | Investigation + run experiment + view results |
| Evaluate | `/evaluate/[id]/[variant]` | TestFlight page for expert rating (shareable, no auth) |

---

## What This Is NOT

- Not a chatbot (banned)
- Not a RAG app (banned)
- Not giving medical/legal advice (banned)
- Not an eval framework (those exist, they don't handle vibes)
- Not a prompt optimizer (those use LLM-as-judge only, which can't measure subjective quality)

**It IS:** Developer infrastructure for improving AI apps on the metrics that matter most and are hardest to measure — the human ones.

---

## Tech Stack

- **Next.js** (TypeScript, App Router) — framework
- **Tailwind CSS + shadcn/ui** — styling
- **OpenAI SDK** — all AI calls (GPT-5)
- **Lucide** — icons
- **Local JSON** — mock data (no database)

---

## Codex Story (for judging)

- **Parallel Agents:** Frontend, API, and Skills built simultaneously in separate worktrees
- **Skills:** `experiment-guideline` (how to run experiments) + `prompt-optimizer` (GPT-5 best practices)
- **Automations:** "9AM daily scan" concept maps to Codex Automations

---

## Stretch Goals

- GitHub PR per variant ("merge the winner")
- Multi-model comparison (GPT-5 vs Claude)
- Streaming responses in UI
- Codex Automation for daily complaint scanning
- Real database (Supabase)
