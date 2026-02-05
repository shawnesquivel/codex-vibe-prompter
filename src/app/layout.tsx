import fs from "node:fs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vibe Prompter",
  description: "Simple GPT-5 prompt runner with trace mode.",
};

const AGENT_PROMPT =
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

function parseFolderDate(folderName: string): string | null {
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
  return `${MONTH_LABELS[monthIndex]} ${day}, ${year}`;
}

function findLatestDataFolder(rootDir: string): string | null {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  let latest: { name: string; key: number } | null = null;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!DATA_FOLDER_PATTERN.test(entry.name)) {
      continue;
    }
    const parsed = parseFolderDate(entry.name);
    if (!parsed) {
      continue;
    }

    const lower = entry.name.toLowerCase();
    const [monthKey, dayRaw, yearRaw] = lower.split("-");
    const monthIndex = MONTH_KEYS.indexOf(monthKey);
    const day = Number(dayRaw);
    const year = Number(yearRaw);
    if (monthIndex < 0 || !Number.isFinite(day) || !Number.isFinite(year)) {
      continue;
    }

    const key = year * 10000 + (monthIndex + 1) * 100 + day;
    if (!latest || key > latest.key) {
      latest = { name: entry.name, key };
    }
  }

  return latest ? latest.name : null;
}

const DATA_FOLDER = findLatestDataFolder(process.cwd());
const INTAKE_DATE = DATA_FOLDER ? parseFolderDate(DATA_FOLDER) : null;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="w-full border-b border-slate-200 bg-white/90 px-6 py-4 text-slate-700 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <span>Complaint Intake Date</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {INTAKE_DATE ?? "Unknown"}
              </span>
              {DATA_FOLDER ? (
                <span className="text-slate-400">({DATA_FOLDER})</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Agent Prompt
              </p>
              <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {AGENT_PROMPT}
              </pre>
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
