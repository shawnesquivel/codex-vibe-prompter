import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  createRunId,
  ensureTraceDir,
  readJsonFile,
  safeJson,
  writeTraceFile,
} from "@/lib/trace";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ORIGINAL_AGENT_PROMPT =
  "You are a supportive, empathetic customer support agent. Respond in a warm, human tone. Acknowledge emotions, ask a brief clarifying question if needed, and provide the next best step. Keep responses concise and practical.";

const DATA_FOLDER_PATTERN = /^[a-z]{3}-\d{1,2}-\d{4}$/;
const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

type TranscriptMessage = { role: string; content: string };
type Transcript = {
  id: string;
  complaint: string;
  messages: TranscriptMessage[];
};
type IntakeData = { complaints: string[]; transcripts: Transcript[] };

type EvalCriterion = {
  dimension: string;
  question: string;
  scoring: string;
};

type Variant = {
  name: string;
  technique: string;
  description: string;
  changed_prompt: string;
  eval_criteria: EvalCriterion[];
};

type DimensionScore = {
  dimension: string;
  score: number;
  reasoning: string;
};

type VariantJudgment = {
  variant_name: string;
  response_text: string;
  scores: DimensionScore[];
  total_score: number;
};

function findLatestDataFolder(rootDir: string): string | null {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  let latest: { name: string; key: number } | null = null;

  for (const entry of entries) {
    if (!entry.isDirectory() || !DATA_FOLDER_PATTERN.test(entry.name)) continue;
    const match = entry.name
      .toLowerCase()
      .match(/^([a-z]{3})-(\d{1,2})-(\d{4})$/);
    if (!match) continue;
    const monthIndex = MONTH_KEYS.indexOf(match[1]);
    if (monthIndex < 0) continue;
    const key =
      Number(match[3]) * 10000 + (monthIndex + 1) * 100 + Number(match[2]);
    if (!latest || key > latest.key) {
      latest = { name: entry.name, key };
    }
  }
  return latest?.name ?? null;
}

function loadTranscripts(folder: string): Transcript[] {
  const filePath = path.join(process.cwd(), folder, "complaint-intake.json");
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as IntakeData;
    return data.transcripts ?? [];
  } catch {
    return [];
  }
}

/**
 * Step 1: Replay a transcript with a variant's prompt to get a new response.
 * We only replay the user messages — the variant prompt replaces the system prompt.
 */
async function replayTranscript(
  variantPrompt: string,
  transcript: Transcript
): Promise<{ response_text: string; trace: unknown }> {
  const userMessages = transcript.messages.filter((m) => m.role === "user");
  if (!userMessages.length) {
    return { response_text: "(no user messages)", trace: { skipped: true } };
  }

  const response = await client.responses.create({
    model: "gpt-4o-mini",
    instructions: variantPrompt,
    input: userMessages.map((m) => ({
      role: "user" as const,
      content: m.content,
    })),
  });

  return {
    response_text: response.output_text ?? "",
    trace: safeJson(response),
  };
}

/**
 * Step 2: Judge a variant's response against its eval criteria.
 */
async function judgeResponse(
  originalTranscript: Transcript,
  variantResponse: string,
  evalCriteria: EvalCriterion[],
  issueName: string
): Promise<{ scores: DimensionScore[]; trace: unknown }> {
  const criteriaBlock = evalCriteria
    .map(
      (c, i) =>
        `${i + 1}. Dimension: ${c.dimension}\n   Question: ${
          c.question
        }\n   Scoring: ${c.scoring}`
    )
    .join("\n\n");

  const originalConvo = originalTranscript.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await client.responses.create({
    model: "gpt-4o-mini",
    instructions:
      "You are a strict, impartial LLM judge for an AI quality platform. " +
      "Score the variant response on each dimension using the provided rubric. " +
      "IMPORTANT SCORING GUIDELINES:\n" +
      "- Scores of 5 should be RARE — only for truly exceptional responses.\n" +
      "- Most competent responses should land at 3-4.\n" +
      "- A score of 3 means 'adequate, does the job'. A score of 4 means 'good, above average'.\n" +
      "- Be critical. Look for specific weaknesses: generic language, missing details, unnecessary verbosity, lack of concrete next steps.\n" +
      "- Compare the response against what a skilled human agent would say.\n" +
      "Provide brief reasoning (1-2 sentences) for each score that justifies why it is NOT higher.",
    input: [
      {
        role: "user",
        content: [
          `Issue being tested: ${issueName}`,
          `User complaint: ${originalTranscript.complaint}`,
          "",
          `Original conversation:\n${originalConvo}`,
          "",
          `Variant response to evaluate:\n${variantResponse}`,
          "",
          `Eval Criteria:\n${criteriaBlock}`,
        ].join("\n"),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "judge_scores",
        description: "Scores for each eval dimension.",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            scores: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  dimension: { type: "string" },
                  score: { type: "number" },
                  reasoning: { type: "string" },
                },
                required: ["dimension", "score", "reasoning"],
              },
            },
          },
          required: ["scores"],
        },
      },
    },
  });

  const raw = response.output_text ?? "";
  try {
    const parsed = JSON.parse(raw) as { scores: DimensionScore[] };
    return {
      scores: parsed.scores ?? [],
      trace: safeJson(response),
    };
  } catch {
    return { scores: [], trace: safeJson(response) };
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const variants = body.variants as Variant[] | undefined;
    const issue = body.issue as
      | { issue: string; transcript_ids?: string[] }
      | undefined;
    const runId = (body.run_id as string) || createRunId();

    if (!variants?.length || !issue) {
      return NextResponse.json(
        {
          error:
            "Provide variants array and issue from generate-variants step.",
        },
        { status: 400 }
      );
    }

    // Load transcripts to replay
    const folder = findLatestDataFolder(process.cwd());
    if (!folder) {
      return NextResponse.json(
        { error: "No data folder found." },
        { status: 400 }
      );
    }

    const allTranscripts = loadTranscripts(folder);
    // Pick the first affected transcript as the test case
    const testTranscript = issue.transcript_ids?.length
      ? allTranscripts.find((t) => t.id === issue.transcript_ids![0])
      : allTranscripts[0];

    if (!testTranscript) {
      return NextResponse.json(
        { error: "No test transcript found." },
        { status: 400 }
      );
    }

    // Build a SHARED eval rubric from the issue, not variant-specific criteria
    // This ensures all candidates are judged on the same dimensions
    const sharedEvalCriteria: EvalCriterion[] = [
      {
        dimension: "empathy",
        question:
          "How well does the response demonstrate genuine understanding of the customer's specific feelings and situation?",
        scoring:
          "1=ignores emotions entirely, 2=generic 'sorry', 3=acknowledges feelings but generically, 4=specific empathy tied to their situation, 5=deeply personalized emotional validation",
      },
      {
        dimension: "solution-orientation",
        question:
          "Does the response move the conversation forward with a clear, actionable next step?",
        scoring:
          "1=no next step, 2=vague suggestion, 3=a next step but unclear, 4=clear actionable step, 5=specific step with timeline/expectation",
      },
      {
        dimension: "conciseness",
        question:
          "Is the response appropriately concise without losing warmth or essential information?",
        scoring:
          "1=wall of text or empty, 2=very verbose, 3=adequate length, 4=well-balanced, 5=perfectly concise with nothing wasted",
      },
    ];

    // Also judge the ORIGINAL prompt as baseline
    const allCandidates = [
      {
        name: "Original (Baseline)",
        changed_prompt: ORIGINAL_AGENT_PROMPT,
        eval_criteria: sharedEvalCriteria,
        technique: "baseline",
        description: "Current production prompt",
      },
      ...variants.map((v) => ({ ...v, eval_criteria: sharedEvalCriteria })),
    ];

    // Run all variants in parallel: replay → judge
    const judgmentPayloads: Array<
      VariantJudgment & { replay_trace: unknown; judge_trace: unknown }
    > = await Promise.all(
      allCandidates.map(async (variant) => {
        const replay = await replayTranscript(
          variant.changed_prompt,
          testTranscript
        );

        const judge = await judgeResponse(
          testTranscript,
          replay.response_text,
          variant.eval_criteria,
          issue.issue
        );

        const total = judge.scores.length
          ? Math.round(
              (judge.scores.reduce((sum, s) => sum + s.score, 0) /
                judge.scores.length) *
                10
            ) / 10
          : 0;

        return {
          variant_name: variant.name,
          response_text: replay.response_text,
          scores: judge.scores,
          total_score: total,
          replay_trace: replay.trace,
          judge_trace: judge.trace,
        };
      })
    );

    // Sort by total score descending
    judgmentPayloads.sort((a, b) => b.total_score - a.total_score);

    const durationMs = Date.now() - startedAt;
    const traceDir = ensureTraceDir(process.cwd(), folder, runId);

    const step1Trace = readJsonFile<{
      summary_path?: string;
      parsed?: {
        issues?: Array<{
          issue?: string;
          severity?: string;
          evidence?: string;
        }>;
      };
      trace_path?: string;
      date?: string;
      source_folder?: string;
    }>(path.join(traceDir, "step1-extract-issues.json"));
    const step2Trace = readJsonFile<{
      experiment_path?: string | null;
    }>(path.join(traceDir, "step2-generate-variants.json"));

    const step3TracePath = writeTraceFile(traceDir, "step3-judge.json", {
      step: "judge",
      run_id: runId,
      started_at: new Date(startedAt).toISOString(),
      duration_ms: durationMs,
      model: "gpt-4o-mini",
      issue: issue.issue,
      test_transcript_id: testTranscript.id,
      candidates: judgmentPayloads,
    });

    const summarizerLines = [
      "# Vibe Check Summarizer",
      "",
      `- Run ID: ${runId}`,
      `- Date: ${step1Trace?.date ?? "Unknown"}`,
      `- Data folder: ${folder}`,
      "",
      "## Step 1: Extract Issues",
      step1Trace?.parsed?.issues?.[0]
        ? `- Primary issue: ${step1Trace.parsed.issues[0].issue}`
        : "- Primary issue: (missing)",
      step1Trace?.parsed?.issues?.[0]?.severity
        ? `- Severity: ${step1Trace.parsed.issues[0].severity}`
        : "- Severity: (missing)",
      step1Trace?.parsed?.issues?.[0]?.evidence
        ? `- Evidence: ${step1Trace.parsed.issues[0].evidence}`
        : "- Evidence: (missing)",
      step1Trace?.summary_path
        ? `- Summary file: ${step1Trace.summary_path}`
        : "- Summary file: (missing)",
      `- Trace: ${path.join(traceDir, "step1-extract-issues.json")}`,
      "",
      "## Step 2: Generate Variants",
      `- Variants generated: ${variants.length}`,
      step2Trace?.experiment_path
        ? `- Experiment file: ${step2Trace.experiment_path}`
        : "- Experiment file: (missing)",
      `- Trace: ${path.join(traceDir, "step2-generate-variants.json")}`,
      "",
      "## Step 3: LLM Judge",
      `- Test transcript: ${testTranscript.id}`,
      `- Winner: ${judgmentPayloads[0]?.variant_name ?? "None"}`,
      `- Trace: ${step3TracePath}`,
      "",
      "## Full Trace Bundle",
      `- ${traceDir}`,
      "",
      "## Scoreboard",
      "| Variant | Total Score |",
      "|---------|-------------|",
      ...judgmentPayloads.map(
        (j) => `| ${j.variant_name} | ${j.total_score.toFixed(1)} |`
      ),
      "",
    ];

    const summarizerPath = path.join(traceDir, "Summarizer.md");
    fs.writeFileSync(summarizerPath, summarizerLines.join("\n"), "utf8");

    console.log(
      `[judge] ok duration_ms=${durationMs} variants_judged=${judgmentPayloads.length} winner=${judgmentPayloads[0]?.variant_name}`
    );

    return NextResponse.json({
      judgments: judgmentPayloads.map(
        ({ replay_trace, judge_trace, ...rest }) => rest
      ),
      test_transcript_id: testTranscript.id,
      winner: judgmentPayloads[0]?.variant_name ?? null,
      duration_ms: durationMs,
      run_id: runId,
      trace_dir: traceDir,
      summarizer_path: summarizerPath,
    });
  } catch (error) {
    console.error(`[judge] error duration_ms=${Date.now() - startedAt}`, error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
