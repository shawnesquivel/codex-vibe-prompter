import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_AGENT_PROMPT =
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

type TranscriptMessage = {
  role?: string;
  content?: unknown;
};

type FolderDate = {
  year: number;
  monthIndex: number;
  day: number;
  display: string;
};

function parseFolderDate(folderName: string): FolderDate | null {
  const match = folderName
    .toLowerCase()
    .match(/^([a-z]{3})-(\d{1,2})-(\d{4})$/);
  if (!match) {
    return null;
  }
  const monthIndex = MONTH_KEYS.indexOf(match[1]);
  if (monthIndex < 0) {
    return null;
  }
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }
  if (day < 1 || day > 31) {
    return null;
  }
  return {
    year,
    monthIndex,
    day,
    display: `${MONTH_LABELS[monthIndex]} ${day}, ${year}`,
  };
}

function findLatestDataFolder(rootDir: string) {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  let latest: { name: string; date: FolderDate; key: number } | null = null;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!DATA_FOLDER_PATTERN.test(entry.name)) {
      continue;
    }
    const date = parseFolderDate(entry.name);
    if (!date) {
      continue;
    }
    const key = date.year * 10000 + (date.monthIndex + 1) * 100 + date.day;
    if (!latest || key > latest.key) {
      latest = { name: entry.name, date, key };
    }
  }

  return latest ? { name: latest.name, date: latest.date } : null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComplaint(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [obj.text, obj.complaint, obj.summary, obj.title];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return "";
}

function normalizeTranscript(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const lines = value
      .map((entry, index) => {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed ? `${index + 1}. ${trimmed}` : "";
        }
        if (!entry || typeof entry !== "object") {
          return "";
        }
        const message = entry as TranscriptMessage;
        const role = typeof message.role === "string" ? message.role : "unknown";
        let content = "";
        if (typeof message.content === "string") {
          content = message.content.trim();
        } else if (message.content != null) {
          try {
            content = JSON.stringify(message.content);
          } catch {
            content = String(message.content);
          }
        }
        if (!content) {
          return "";
        }
        return `${index + 1}. ${role}: ${content}`;
      })
      .filter(Boolean);
    return lines.join("\n");
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return normalizeTranscript(obj.messages);
    }
  }
  return "";
}

function loadLatestComplaintIntake(rootDir: string) {
  const latestFolder = findLatestDataFolder(rootDir);
  if (!latestFolder) {
    return null;
  }

  const filePath = path.join(rootDir, latestFolder.name, "complaint-intake.json");
  if (!fs.existsSync(filePath)) {
    return {
      folder: latestFolder.name,
      date: latestFolder.date,
      complaint: "",
      transcript: "",
      transcriptId: "",
    };
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    data = {};
  }

  const complaint = normalizeComplaint(data.complaint ?? data.complaintText);

  const transcripts = Array.isArray(data.transcripts)
    ? (data.transcripts as Array<Record<string, unknown>>)
    : [];
  const latestTranscript = transcripts.length
    ? transcripts[transcripts.length - 1]
    : (data.transcript as Record<string, unknown> | undefined) ??
      (data.conversation as Record<string, unknown> | undefined) ??
      (data.messages as Record<string, unknown> | undefined);

  const transcript = normalizeTranscript(
    latestTranscript && typeof latestTranscript === "object"
      ? (latestTranscript as Record<string, unknown>).messages ?? latestTranscript
      : latestTranscript
  );

  const transcriptId =
    latestTranscript && typeof latestTranscript === "object"
      ? normalizeString((latestTranscript as Record<string, unknown>).id)
      : "";

  return {
    folder: latestFolder.name,
    date: latestFolder.date,
    complaint,
    transcript,
    transcriptId,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY on the server." },
        { status: 500 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const debug = Boolean(body?.debug);
    const useLatest = Boolean(
      body?.useLatest ?? body?.useLatestTranscripts ?? body?.useLatestComplaint
    );

    const latestData = loadLatestComplaintIntake(process.cwd());

    let complaint = normalizeComplaint(body?.complaint ?? body?.complaintText);
    let transcript = normalizeTranscript(
      body?.transcript ?? body?.conversation ?? body?.messages
    );
    let prompt = normalizeString(body?.prompt ?? body?.systemPrompt);

    if (useLatest || !complaint || !transcript) {
      if (latestData) {
        if (!complaint) {
          complaint = latestData.complaint;
        }
        if (!transcript) {
          transcript = latestData.transcript;
        }
      }
    }

    if (!prompt) {
      prompt = DEFAULT_AGENT_PROMPT;
    }

    if (!complaint || !transcript || !prompt) {
      return NextResponse.json(
        {
          error:
            "Please provide complaint, transcript, and prompt in the request body, or ensure complaint-intake.json is available.",
        },
        { status: 400 }
      );
    }

    const investigatorPrompt =
      "You are an expert investigator analyzing subjective quality complaints about AI responses. " +
      "Given a complaint, the conversation transcript, and the system prompt that produced the responses, " +
      "identify what went wrong, why the prompt caused it, and the most relevant prompt section. " +
      "Be specific and concise. If no prompt section is clearly responsible, say so.";

    const response = await client.responses.create({
      model: "gpt-5",
      instructions: investigatorPrompt,
      input: [
        {
          role: "user",
          content:
            `Complaint:\n${complaint}\n\nTranscript:\n${transcript}\n\nSystem Prompt:\n${prompt}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "vibe_investigation",
          description:
            "Analysis of a complaint with a hypothesis and relevant prompt section.",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              analysis: {
                type: "string",
                description:
                  "What pattern the AI exhibited and how it manifested in the transcript.",
              },
              hypothesis: {
                type: "string",
                description:
                  "Why the current prompt produced that behavior.",
              },
              prompt_section: {
                type: "string",
                description:
                  "The most relevant excerpt or reference to the prompt section. If none, say so.",
              },
            },
            required: ["analysis", "hypothesis", "prompt_section"],
          },
        },
      },
    });

    const raw = response.output_text ?? "";
    let parsed: Record<string, unknown> | null = null;

    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json(
        {
          error: "Failed to parse model output.",
          raw: debug ? raw : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      analysis: parsed.analysis ?? "",
      hypothesis: parsed.hypothesis ?? "",
      prompt_section: parsed.prompt_section ?? "",
      date: latestData?.date.display ?? null,
      source_folder: latestData?.folder ?? null,
      transcript_id: latestData?.transcriptId ?? null,
      trace: debug ? response : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
