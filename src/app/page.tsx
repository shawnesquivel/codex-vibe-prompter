"use client";

import { useState } from "react";

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

type Step1Result = {
  issues: Issue[];
  complaints_map: Record<string, string>;
  summary_markdown: string;
  date: string;
  source_folder: string;
  duration_ms: number;
};

type Step2Result = {
  variants: Variant[];
  issue: Issue;
  duration_ms: number;
};

type Step3Result = {
  judgments: VariantJudgment[];
  test_transcript_id: string;
  winner: string | null;
  duration_ms: number;
};

type PipelineStep = "idle" | "extracting" | "generating" | "judging" | "done";

export default function Home() {
  const [step, setStep] = useState<PipelineStep>("idle");
  const [step1, setStep1] = useState<Step1Result | null>(null);
  const [step2, setStep2] = useState<Step2Result | null>(null);
  const [step3, setStep3] = useState<Step3Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPipeline = async () => {
    setError(null);
    setStep1(null);
    setStep2(null);
    setStep3(null);

    // Step 1: Extract single HIGH issue
    setStep("extracting");
    try {
      const res1 = await fetch("/api/vibe/extract-issues", { method: "POST" });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error || "Step 1 failed.");
      setStep1(data1 as Step1Result);

      const issue = data1.issues[0];

      // Step 2: Generate 3 variants for the HIGH issue
      setStep("generating");
      const res2 = await fetch("/api/vibe/generate-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, source_folder: data1.source_folder }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "Step 2 failed.");
      setStep2(data2 as Step2Result);

      // Step 3: LLM-as-Judge
      setStep("judging");
      const res3 = await fetch("/api/vibe/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variants: data2.variants,
          issue,
        }),
      });
      const data3 = await res3.json();
      if (!res3.ok) throw new Error(data3.error || "Step 3 failed.");
      setStep3(data3 as Step3Result);

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("done");
    }
  };

  const severityColor = (s: string) => {
    if (s === "high") return "bg-red-100 text-red-700";
    if (s === "medium") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
  };

  const scoreColor = (score: number) => {
    if (score >= 4) return "text-emerald-600";
    if (score >= 3) return "text-amber-600";
    return "text-red-600";
  };

  const stepIndicator = (
    label: string,
    stepKey: PipelineStep,
    durationMs?: number
  ) => {
    const isActive = step === stepKey;
    const pastSteps: Record<PipelineStep, PipelineStep[]> = {
      idle: [],
      extracting: [],
      generating: ["extracting"],
      judging: ["extracting", "generating"],
      done: ["extracting", "generating", "judging"],
    };
    const resultMap: Record<string, boolean> = {
      extracting: !!step1,
      generating: !!step2,
      judging: !!step3,
    };
    const isDone = pastSteps[step]?.includes(stepKey) && resultMap[stepKey];

    return (
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
          isActive
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : isDone
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-400"
        }`}
      >
        {isActive && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        )}
        {isDone && <span className="text-emerald-500">&#10003;</span>}
        {!isActive && !isDone && (
          <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
        )}
        <span className="font-medium">{label}</span>
        {isDone && durationMs != null && (
          <span className="ml-auto text-xs opacity-70">
            {(durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f4f1ff_0%,#fdfbf7_45%,#f1f5f9_100%)] px-6 py-12 text-slate-950">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Vibe Check
          </p>
          <h1 className="text-3xl font-semibold leading-tight">
            Prompt Experiment Pipeline
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Extract the #1 issue, generate 3 prompt variants, then score them
            with LLM-as-judge.
          </p>
        </header>

        {/* Pipeline Controls */}
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-lg shadow-slate-200/40 backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={runPipeline}
                disabled={
                  step === "extracting" ||
                  step === "generating" ||
                  step === "judging"
                }
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.15em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {step === "idle" || step === "done"
                  ? "Run Pipeline"
                  : "Running..."}
              </button>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3">
              {stepIndicator(
                "1. Extract Issue",
                "extracting",
                step1?.duration_ms
              )}
              {stepIndicator(
                "2. Generate Variants",
                "generating",
                step2?.duration_ms
              )}
              {stepIndicator("3. LLM Judge", "judging", step3?.duration_ms)}
            </div>
          </div>
        </section>

        {/* Step 1: Issues */}
        {step1 && step1.issues[0] && (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Extracted Issues
              </h2>
              <span className="text-xs text-slate-400">
                {step1.date} &middot; {step1.source_folder}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {/* HIGH — experiment target */}
              {(() => {
                const iss = step1.issues[0];
                return (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50/30 p-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${severityColor(
                          iss.severity
                        )}`}
                      >
                        {iss.severity}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {iss.issue}
                      </span>
                      <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                        Experiment Target
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {iss.evidence}
                    </p>
                    {iss.transcript_ids?.length && step1.complaints_map ? (
                      <div className="mt-3 flex flex-col gap-1.5">
                        {iss.transcript_ids.map((tid) => {
                          const quote = step1.complaints_map[tid];
                          if (!quote) return null;
                          return (
                            <p key={tid} className="text-sm text-slate-500">
                              <span className="font-mono text-xs text-slate-400">
                                {tid}:
                              </span>{" "}
                              <span className="italic text-slate-600">
                                &ldquo;{quote}&rdquo;
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Secondary — flagged for awareness */}
              {step1.issues[1] &&
                (() => {
                  const iss = step1.issues[1];
                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-80">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${severityColor(
                            iss.severity
                          )}`}
                        >
                          {iss.severity}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">
                          {iss.issue}
                        </span>
                        <span className="ml-auto text-xs text-slate-400">
                          Flagged
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {iss.evidence}
                      </p>
                      {iss.transcript_ids?.length && step1.complaints_map ? (
                        <div className="mt-3 flex flex-col gap-1.5">
                          {iss.transcript_ids.map((tid) => {
                            const quote = step1.complaints_map[tid];
                            if (!quote) return null;
                            return (
                              <p key={tid} className="text-sm text-slate-500">
                                <span className="font-mono text-xs text-slate-400">
                                  {tid}:
                                </span>{" "}
                                <span className="italic text-slate-600">
                                  &ldquo;{quote}&rdquo;
                                </span>
                              </p>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
            </div>
          </section>
        )}

        {/* Step 2: Variants with structured evals */}
        {step2 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Prompt Variants
              </h2>
              <span className="text-xs text-slate-400">
                Targeting: {step2.issue.issue}
              </span>
            </div>
            {step2.variants.map((variant, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg shadow-slate-200/40"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <h3 className="text-base font-semibold text-slate-800">
                    {variant.name}
                  </h3>
                  <span className="ml-auto text-xs text-slate-400">
                    {variant.technique}
                  </span>
                </div>

                <p className="text-sm text-slate-600">{variant.description}</p>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 hover:text-slate-700">
                    Modified Prompt
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                    {variant.changed_prompt}
                  </pre>
                </details>

                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    LLM-Judge Eval Criteria
                  </p>
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Dimension</th>
                          <th className="px-3 py-2">Question</th>
                          <th className="px-3 py-2">Scoring (1-5)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {variant.eval_criteria.map((c, ci) => (
                          <tr key={ci}>
                            <td className="px-3 py-2 font-medium text-slate-700">
                              {c.dimension}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {c.question}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {c.scoring}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Step 3: Judge Results */}
        {step3 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                LLM-as-Judge Results
              </h2>
              <span className="text-xs text-slate-400">
                Test: {step3.test_transcript_id}
              </span>
            </div>

            {/* Winner banner */}
            {step3.winner && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                Winner: <span className="font-bold">{step3.winner}</span>{" "}
                (score: {step3.judgments[0]?.total_score.toFixed(1)}/5)
              </div>
            )}

            {step3.judgments.map((judgment, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-6 shadow-lg shadow-slate-200/40 ${
                  i === 0
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200 bg-white/90"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800">
                    {judgment.variant_name}
                  </h3>
                  <span
                    className={`text-lg font-bold ${scoreColor(
                      judgment.total_score
                    )}`}
                  >
                    {judgment.total_score.toFixed(1)}/5
                  </span>
                </div>

                {/* Score breakdown */}
                <div className="flex flex-wrap gap-2">
                  {judgment.scores.map((s, si) => (
                    <div
                      key={si}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        {s.dimension}
                      </p>
                      <p className={`text-lg font-bold ${scoreColor(s.score)}`}>
                        {s.score}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.reasoning}
                      </p>
                    </div>
                  ))}
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 hover:text-slate-700">
                    Variant Response
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                    {judgment.response_text}
                  </pre>
                </details>
              </div>
            ))}
          </section>
        )}

        <footer className="text-xs text-slate-400">
          Pipeline: extract-issues → generate-variants → llm-judge. All
          gpt-4o-mini. Original baseline included in judging.
        </footer>
      </main>
    </div>
  );
}
