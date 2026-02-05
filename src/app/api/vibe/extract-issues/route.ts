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
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type TranscriptMessage = { role: string; content: string };
type Transcript = {
  id: string;
  complaint: string;
  messages: TranscriptMessage[];
};
type IntakeData = { complaints: string[]; transcripts: Transcript[] };

type Issue = {
  issue: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  transcript_ids: string[];
};

function parseFolderDate(folderName: string) {
  const match = folderName
    .toLowerCase()
    .match(/^([a-z]{3})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTH_KEYS.indexOf(match[1]);
  if (monthIndex < 0) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isFinite(day) || !Number.isFinite(year) || day < 1 || day > 31)
    return null;
  return {
    year,
    monthIndex,
    day,
    display: `${MONTH_LABELS[monthIndex]} ${day}, ${year}`,
    key: year * 10000 + (monthIndex + 1) * 100 + day,
  };
}

function findLatestDataFolder(rootDir: string) {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  let latest: {
    name: string;
    date: ReturnType<typeof parseFolderDate>;
    key: number;
  } | null = null;

  for (const entry of entries) {
    if (!entry.isDirectory() || !DATA_FOLDER_PATTERN.test(entry.name)) continue;
    const date = parseFolderDate(entry.name);
    if (!date) continue;
    if (!latest || date.key > latest.key) {
      latest = { name: entry.name, date, key: date.key };
    }
  }

  return latest ? { name: latest.name, date: latest.date! } : null;
}

function loadIntakeData(
  rootDir: string
): { folder: string; date: string; data: IntakeData } | null {
  const latestFolder = findLatestDataFolder(rootDir);
  if (!latestFolder) return null;

  const filePath = path.join(
    rootDir,
    latestFolder.name,
    "complaint-intake.json"
  );
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as IntakeData;
    return {
      folder: latestFolder.name,
      date: latestFolder.date.display,
      data: raw,
    };
  } catch {
    return null;
  }
}

export async function POST() {
  const startedAt = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const intake = loadIntakeData(process.cwd());
    if (
      !intake ||
      !intake.data.complaints?.length ||
      !intake.data.transcripts?.length
    ) {
      return NextResponse.json(
        { error: "No complaint-intake.json found or it's empty." },
        { status: 400 }
      );
    }

    const { folder, date, data } = intake;
    const runId = createRunId();
    const traceDir = ensureTraceDir(process.cwd(), folder, runId);

    // Build a condensed view of complaints + transcripts for the fast model
    const complaintsBlock = data.complaints
      .map((c, i) => `${i + 1}. ${c}`)
      .join("\n");
    const transcriptsBlock = data.transcripts
      .map((t) => {
        const msgs = t.messages
          .map((m) => `  ${m.role}: ${m.content}`)
          .join("\n");
        return `[${t.id}] "${t.complaint}"\n${msgs}`;
      })
      .join("\n\n");

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      instructions:
        "You are an issue extractor for an AI quality platform. " +
        "Given customer complaints and conversation transcripts about an AI agent, " +
        "identify exactly 2 issues:\n" +
        "1. The SINGLE most important issue (severity=high). Group similar complaints into it. " +
        "List ALL transcript IDs that exhibit it.\n" +
        "2. One secondary issue (severity=medium or low) that is a distinct, lesser problem.\n" +
        "We only run experiments on the high-severity issue. " +
        "The secondary issue is flagged for awareness. " +
        "Be concrete and brief.",
      input: [
        {
          role: "user",
          content: `Date: ${date}\n\nComplaints:\n${complaintsBlock}\n\nTranscripts:\n${transcriptsBlock}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "issue_extraction",
          description: "Extracted issues from complaint data.",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    issue: { type: "string" },
                    severity: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                    },
                    evidence: { type: "string" },
                    transcript_ids: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["issue", "severity", "evidence", "transcript_ids"],
                },
              },
            },
            required: ["issues"],
          },
        },
      },
    });

    const raw = response.output_text ?? "";
    let parsed: { issues: Issue[] } | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as { issues: Issue[] }) : null;
    } catch {
      parsed = null;
    }

    if (!parsed?.issues?.length) {
      return NextResponse.json(
        { error: "Failed to parse issues.", raw },
        { status: 500 }
      );
    }

    // 1 high + 1 medium/low
    const highIssue =
      parsed.issues.find((iss) => iss.severity === "high") ?? parsed.issues[0];
    const secondaryIssue = parsed.issues.find(
      (iss) =>
        iss !== highIssue &&
        (iss.severity === "medium" || iss.severity === "low")
    );
    const issues = secondaryIssue ? [highIssue, secondaryIssue] : [highIssue];

    // Build a map of transcript_id → complaint text for the frontend
    const complaintsMap: Record<string, string> = {};
    for (const t of data.transcripts) {
      if (t.id && t.complaint) {
        complaintsMap[t.id] = t.complaint;
      }
    }

    // Write summary.md to the date folder
    const summaryLines = [
      "# Complaint Summary",
      "",
      `- Date: ${date}`,
      `- Complaints: ${data.complaints.length}`,
      `- Transcripts: ${data.transcripts.length}`,
      "",
      "## Experiment Target",
      `- **${issues[0].issue}** (severity: ${issues[0].severity})`,
      `- Evidence: ${issues[0].evidence}`,
      `- Transcripts: ${issues[0].transcript_ids.join(", ")}`,
      "",
      ...(issues[1]
        ? [
            "## Also Flagged",
            `- **${issues[1].issue}** (severity: ${issues[1].severity})`,
            `- Evidence: ${issues[1].evidence}`,
            `- Transcripts: ${issues[1].transcript_ids.join(", ")}`,
            "",
          ]
        : []),
    ];
    const summaryMd = summaryLines.join("\n");
    const summaryPath = path.join(process.cwd(), folder, "summary.md");
    fs.writeFileSync(summaryPath, summaryMd, "utf8");

    const durationMs = Date.now() - startedAt;
    console.log(
      `[extract-issues] ok duration_ms=${durationMs} issues=${issues.length}`
    );

    const tracePayload = {
      step: "extract-issues",
      run_id: runId,
      started_at: new Date(startedAt).toISOString(),
      duration_ms: durationMs,
      model: "gpt-4o-mini",
      instructions:
        "You are an issue extractor for an AI quality platform. " +
        "Given customer complaints and conversation transcripts about an AI agent, " +
        "identify exactly 2 issues:\n" +
        "1. The SINGLE most important issue (severity=high). Group similar complaints into it. " +
        "List ALL transcript IDs that exhibit it.\n" +
        "2. One secondary issue (severity=medium or low) that is a distinct, lesser problem.\n" +
        "We only run experiments on the high-severity issue. " +
        "The secondary issue is flagged for awareness. " +
        "Be concrete and brief.",
      input: `Date: ${date}\n\nComplaints:\n${complaintsBlock}\n\nTranscripts:\n${transcriptsBlock}`,
      output_text: raw,
      parsed,
      response: safeJson(response),
      summary_path: summaryPath,
      source_folder: folder,
      date,
      counts: {
        complaints: data.complaints.length,
        transcripts: data.transcripts.length,
      },
    };
    const tracePath = writeTraceFile(
      traceDir,
      "step1-extract-issues.json",
      tracePayload
    );

    return NextResponse.json({
      issues,
      complaints_map: complaintsMap,
      summary_markdown: summaryMd,
      date,
      source_folder: folder,
      duration_ms: durationMs,
      run_id: runId,
      trace_dir: traceDir,
      trace_path: tracePath,
    });
  } catch (error) {
    console.error(
      `[extract-issues] error duration_ms=${Date.now() - startedAt}`,
      error
    );
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
