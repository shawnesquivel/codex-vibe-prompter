import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  createRunId,
  ensureTraceDir,
  safeJson,
  writeTraceFile,
} from "@/lib/trace";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AGENT_PROMPT =
  "You are a supportive, empathetic customer support agent. Respond in a warm, human tone. Acknowledge emotions, ask a brief clarifying question if needed, and provide the next best step. Keep responses concise and practical.";

const SIMPLE_GUIDE_PATH = path.join(
  process.cwd(),
  "codex",
  "gpt-5-prompting-guide-SIMPLE.md"
);

function loadSimpleGuide(): string {
  try {
    return fs.readFileSync(SIMPLE_GUIDE_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

type Issue = {
  issue: string;
  severity: string;
  evidence: string;
  transcript_ids?: string[];
};

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

type VariantOutput = {
  variants: Variant[];
};

function toTitleCaseToken(value: string): string {
  if (!value) return "Experiment";
  const cleaned = value
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1));
  return cleaned.join("") || "Experiment";
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

    const issue = body.issue as Issue | undefined;
    const sourceFolder = (body.source_folder as string) || "";
    const runId = (body.run_id as string) || createRunId();

    if (!issue) {
      return NextResponse.json(
        { error: "Provide issue object from extract-issues step." },
        { status: 400 }
      );
    }

    const simpleGuide = loadSimpleGuide();

    const systemInstructions = [
      "You are a prompt engineer for an AI quality platform.",
      "Given the current agent system prompt and a HIGH severity issue from customer complaints,",
      "generate exactly 3 prompt variants (A, B, C) that fix the issue.",
      "",
      "Each variant uses a DIFFERENT technique:",
      "- Variant A (Targeted Fix): Minimal, surgical edits to the existing prompt to directly address the issue.",
      "- Variant B (Technique Injection): Add a specific prompting technique (step-by-step reasoning, role anchoring, verbosity control, etc.).",
      "- Variant C (Self-Reflection Rubric): Add a self-check rubric so the AI evaluates its own output before responding.",
      "",
      "For each variant, generate 3 eval_criteria for LLM-as-judge scoring.",
      "Each eval criterion is an object with:",
      "  - dimension: short label (e.g. 'empathy', 'actionability', 'conciseness')",
      "  - question: what the judge should evaluate (phrased as a question)",
      "  - scoring: rubric for 1-5 scale (e.g. '1=ignores emotion entirely, 3=generic acknowledgment, 5=specific empathetic response tied to user situation')",
      "",
      "These evals will be fed directly to an LLM judge that scores each variant's output.",
      "",
      simpleGuide ? `Reference prompting guide:\n${simpleGuide}\n` : "",
      "Keep prompt changes focused. Don't rewrite the entire prompt unless necessary.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: systemInstructions,
      input: [
        {
          role: "user",
          content: [
            `Current Agent Prompt:\n${AGENT_PROMPT}`,
            "",
            `HIGH Severity Issue: ${issue.issue}`,
            `Evidence: ${issue.evidence}`,
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "variant_generation",
          description: "Three prompt variants with LLM-judge eval criteria.",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              variants: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    technique: { type: "string" },
                    description: { type: "string" },
                    changed_prompt: { type: "string" },
                    eval_criteria: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          dimension: { type: "string" },
                          question: { type: "string" },
                          scoring: { type: "string" },
                        },
                        required: ["dimension", "question", "scoring"],
                      },
                    },
                  },
                  required: [
                    "name",
                    "technique",
                    "description",
                    "changed_prompt",
                    "eval_criteria",
                  ],
                },
              },
            },
            required: ["variants"],
          },
        },
      },
    });

    const raw = response.output_text ?? "";
    let parsed: VariantOutput | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as VariantOutput) : null;
    } catch {
      parsed = null;
    }

    if (!parsed?.variants?.length) {
      return NextResponse.json(
        { error: "Failed to parse variants.", raw },
        { status: 500 }
      );
    }

    const variants = parsed.variants.slice(0, 3);

    // Write Experiment markdown to the date folder
    let experimentPath = "";
    if (sourceFolder) {
      const experimentToken = toTitleCaseToken(
        issue.issue.split(/\s+/).slice(0, 2).join(" ")
      );
      const experimentFilename = `Experiment_${experimentToken}.md`;

      const lines = [
        `# Experiment: ${experimentToken}`,
        "",
        `- **Date:** ${sourceFolder}`,
        `- **Issue:** ${issue.issue}`,
        `- **Severity:** ${issue.severity}`,
        `- **Evidence:** ${issue.evidence}`,
        "",
        "---",
        "",
      ];

      for (const variant of variants) {
        lines.push(
          `## ${variant.name}`,
          `**Technique:** ${variant.technique}`,
          "",
          `**What changed:** ${variant.description}`,
          "",
          "**Modified Prompt:**",
          "```",
          variant.changed_prompt,
          "```",
          "",
          "**LLM-Judge Eval Criteria:**",
          "",
          "| Dimension | Question | Scoring (1-5) |",
          "|-----------|----------|---------------|",
          ...variant.eval_criteria.map(
            (c) => `| ${c.dimension} | ${c.question} | ${c.scoring} |`
          ),
          "",
          "---",
          ""
        );
      }

      const experimentMd = lines.join("\n");
      experimentPath = path.join(
        process.cwd(),
        sourceFolder,
        experimentFilename
      );
      fs.writeFileSync(experimentPath, experimentMd, "utf8");
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[generate-variants] ok duration_ms=${durationMs} variants=${variants.length}`
    );

    if (sourceFolder) {
      const traceDir = ensureTraceDir(process.cwd(), sourceFolder, runId);
      writeTraceFile(traceDir, "step2-generate-variants.json", {
        step: "generate-variants",
        run_id: runId,
        started_at: new Date(startedAt).toISOString(),
        duration_ms: durationMs,
        model: "gpt-4o-mini",
        instructions: systemInstructions,
        input: [
          `Current Agent Prompt:\n${AGENT_PROMPT}`,
          "",
          `HIGH Severity Issue: ${issue.issue}`,
          `Evidence: ${issue.evidence}`,
        ].join("\n"),
        output_text: raw,
        parsed,
        response: safeJson(response),
        source_folder: sourceFolder,
        experiment_path: experimentPath || null,
      });
    }

    return NextResponse.json({
      variants,
      issue,
      duration_ms: durationMs,
      run_id: runId,
      trace_dir: sourceFolder
        ? path.join(process.cwd(), sourceFolder, "trace", runId)
        : null,
      experiment_path: experimentPath || null,
    });
  } catch (error) {
    console.error(
      `[generate-variants] error duration_ms=${Date.now() - startedAt}`,
      error
    );
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
