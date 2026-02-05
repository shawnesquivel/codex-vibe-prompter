import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function createRunId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function ensureTraceDir(
  rootDir: string,
  sourceFolder: string,
  runId: string
): string {
  const traceDir = path.join(rootDir, sourceFolder, "trace", runId);
  fs.mkdirSync(traceDir, { recursive: true });
  return traceDir;
}

export function safeJson(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}

export function writeTraceFile(
  traceDir: string,
  filename: string,
  payload: unknown
): string {
  const filePath = path.join(traceDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
