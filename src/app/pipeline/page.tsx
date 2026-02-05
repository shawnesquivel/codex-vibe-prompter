"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ── Types (same as root page) ── */
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

/* ── SVG Connector ──
   Draws dotted bezier curves from a single origin point (left)
   to N target points (right). Uses refs to measure actual DOM positions. */
function NodeConnector({
  originRef,
  targetRefs,
}: {
  originRef: React.RefObject<HTMLDivElement | null>;
  targetRefs: React.RefObject<(HTMLDivElement | null)[]>;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [paths, setPaths] = useState<string[]>([]);

  const recalc = useCallback(() => {
    const svg = svgRef.current;
    const origin = originRef.current;
    const targets = targetRefs.current;
    if (!svg || !origin || !targets) return;

    const svgRect = svg.getBoundingClientRect();
    const oRect = origin.getBoundingClientRect();
    // Origin: right-center of the issue node
    const ox = oRect.right - svgRect.left;
    const oy = oRect.top + oRect.height / 2 - svgRect.top;

    const newPaths: string[] = [];
    for (const t of targets) {
      if (!t) continue;
      const tRect = t.getBoundingClientRect();
      // Target: left-center of variant node
      const tx = tRect.left - svgRect.left;
      const ty = tRect.top + tRect.height / 2 - svgRect.top;
      // Cubic bezier with horizontal control points
      const cpx = (ox + tx) / 2;
      newPaths.push(`M ${ox} ${oy} C ${cpx} ${oy}, ${cpx} ${ty}, ${tx} ${ty}`);
    }
    setPaths(newPaths);
  }, [originRef, targetRefs]);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  // Recalculate after a short delay to let the DOM settle
  useEffect(() => {
    const id = setTimeout(recalc, 50);
    return () => clearTimeout(id);
  }, [recalc]);

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 1 }}
    >
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -20; } }
        .connector-line { animation: dash 0.8s linear infinite; }
      `}</style>
      {paths.map((d, i) => (
        <g key={i}>
          <path
            d={d}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="connector-line"
          />
          {/* Small dot at the target end */}
          {(() => {
            const match = d.match(/, ([\d.]+) ([\d.]+)$/);
            if (!match) return null;
            return <circle cx={match[1]} cy={match[2]} r={4} fill="#94a3b8" />;
          })()}
        </g>
      ))}
      {/* Dot at origin */}
      {paths.length > 0 &&
        (() => {
          const match = paths[0].match(/^M ([\d.]+) ([\d.]+)/);
          if (!match) return null;
          return <circle cx={match[1]} cy={match[2]} r={4} fill="#94a3b8" />;
        })()}
    </svg>
  );
}

/* ── Main Page ── */
export default function PipelinePage() {
  const [step, setStep] = useState<PipelineStep>("idle");
  const [step1, setStep1] = useState<Step1Result | null>(null);
  const [step2, setStep2] = useState<Step2Result | null>(null);
  const [step3, setStep3] = useState<Step3Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for connector lines
  const issueNodeRef = useRef<HTMLDivElement | null>(null);
  const variantNodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const runPipeline = async () => {
    setError(null);
    setStep1(null);
    setStep2(null);
    setStep3(null);

    setStep("extracting");
    try {
      const res1 = await fetch("/api/vibe/extract-issues", { method: "POST" });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error || "Step 1 failed.");
      setStep1(data1 as Step1Result);

      const issue = data1.issues[0];

      setStep("generating");
      const res2 = await fetch("/api/vibe/generate-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, source_folder: data1.source_folder }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "Step 2 failed.");
      setStep2(data2 as Step2Result);

      setStep("judging");
      const res3 = await fetch("/api/vibe/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants: data2.variants, issue }),
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

  const isRunning =
    step === "extracting" || step === "generating" || step === "judging";

  const severityColor = (s: string) => {
    if (s === "high") return "bg-red-100 text-red-700 border-red-200";
    if (s === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-slate-100 text-slate-600 border-slate-200";
  };

  const stepDot = (
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
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          isActive
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : isDone
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-400"
        }`}
      >
        {isActive && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        )}
        {isDone && <span className="text-emerald-500">&#10003;</span>}
        {!isActive && !isDone && (
          <span className="h-3 w-3 rounded-full border-2 border-slate-200" />
        )}
        {label}
        {isDone && durationMs != null && (
          <span className="ml-1 opacity-60">
            {(durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    );
  };

  const variantLetter = (i: number) => String.fromCharCode(65 + i);

  const scoreColor = (score: number) => {
    if (score >= 4) return "text-emerald-600";
    if (score >= 3) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f4f1ff_0%,#fdfbf7_45%,#f1f5f9_100%)] px-6 py-10 text-slate-950">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Vibe Check &mdash; Node View
          </p>
          <h1 className="text-2xl font-semibold">Prompt Experiment Pipeline</h1>
          <p className="text-sm text-slate-500">
            Extract the #1 issue, generate 3 prompt variants, then score them
            with LLM-as-judge.
          </p>
        </header>

        {/* Pipeline Controls */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <button
            onClick={runPipeline}
            disabled={isRunning}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isRunning ? "Running…" : "Run Pipeline"}
          </button>
          {stepDot("1. Extract Issue", "extracting", step1?.duration_ms)}
          {stepDot("2. Generate Variants", "generating", step2?.duration_ms)}
          {stepDot("3. LLM Judge", "judging", step3?.duration_ms)}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* ─── Node Graph ─── */}
        {step1 && step1.issues[0] && (
          <section className="relative mb-10">
            <div className="flex items-stretch gap-0">
              {/* LEFT: Extracted Issue Node */}
              <div className="flex w-80 shrink-0 items-center pr-0">
                <div
                  ref={issueNodeRef}
                  className="w-full rounded-2xl border-2 border-red-200 bg-white p-5 shadow-md"
                >
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Extracted Issue
                  </p>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityColor(
                        step1.issues[0].severity
                      )}`}
                    >
                      {step1.issues[0].severity}
                    </span>
                    {step1.issues[0].transcript_ids && (
                      <span className="text-[10px] text-slate-400">
                        {step1.issues[0].transcript_ids.length} transcripts
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold leading-snug text-slate-800">
                    {step1.issues[0].issue}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {step1.issues[0].evidence}
                  </p>
                </div>
              </div>

              {/* CENTER GAP — connector lines are drawn via absolute SVG */}
              <div className="w-28 shrink-0" />

              {/* RIGHT: Variant Nodes (or placeholder) */}
              <div className="flex flex-1 flex-col gap-6">
                {step2 ? (
                  step2.variants.map((variant, i) => (
                    <div
                      key={i}
                      ref={(el) => {
                        variantNodeRefs.current[i] = el;
                      }}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {variantLetter(i)}
                        </span>
                        <h3 className="text-sm font-semibold text-slate-800">
                          {variant.name}
                        </h3>
                        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          {variant.technique}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {variant.description}
                      </p>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                          Modified Prompt
                        </summary>
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200">
                          {variant.changed_prompt}
                        </pre>
                      </details>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                          Eval Criteria ({variant.eval_criteria.length})
                        </summary>
                        <div className="mt-2 flex flex-col gap-1">
                          {variant.eval_criteria.map((c, ci) => (
                            <div
                              key={ci}
                              className="rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600"
                            >
                              <span className="font-semibold text-slate-700">
                                {c.dimension}
                              </span>
                              : {c.question}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))
                ) : (
                  /* Placeholder slots while generating */
                  <>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        ref={(el) => {
                          variantNodeRefs.current[i] = el;
                        }}
                        className="flex h-28 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50"
                      >
                        <span className="text-xs text-slate-300">
                          Variant {variantLetter(i)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* SVG overlay for connector lines */}
              <NodeConnector
                originRef={issueNodeRef}
                targetRefs={variantNodeRefs}
              />
            </div>
          </section>
        )}

        {/* ─── Eval Results ─── */}
        {step3 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                LLM-as-Judge Results
              </h2>
              <span className="text-xs text-slate-400">
                Test: {step3.test_transcript_id}
              </span>
            </div>

            {/* Winner banner */}
            {step3.winner && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                Winner: <span className="font-bold">{step3.winner}</span>{" "}
                (score: {step3.judgments[0]?.total_score.toFixed(1)}/5)
              </div>
            )}

            {/* Score cards in a horizontal row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {step3.judgments.map((j, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 shadow-md ${
                    i === 0
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-700 leading-tight">
                      {j.variant_name}
                    </h3>
                    <span
                      className={`text-lg font-bold ${scoreColor(
                        j.total_score
                      )}`}
                    >
                      {j.total_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {j.scores.map((s, si) => (
                      <div
                        key={si}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="text-slate-500">{s.dimension}</span>
                        <span className={`font-bold ${scoreColor(s.score)}`}>
                          {s.score}/5
                        </span>
                      </div>
                    ))}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                      Response
                    </summary>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200">
                      {j.response_text}
                    </pre>
                  </details>
                </div>
              ))}
            </div>

            {/*
              ── EVAL RESULTS UI SUGGESTION ──

              Option A (extend the graph): Add a 3rd column of "score nodes"
              to the right of the variant nodes, connected by another set of
              dotted lines. Each score node shows the variant letter, total
              score, and a small bar/spark for each dimension. The winner gets
              a green border highlight.

              Option B (leaderboard bar chart): Below the graph, show a
              horizontal bar chart where each variant is a bar scaled to its
              total score (out of 5). Color the winner green.

              Option C (inline badges): Skip a separate section entirely —
              just add a score badge (e.g. "4.7/5") to the top-right corner
              of each variant node in the graph, highlighted green for the
              winner.

              Recommendation: Option A keeps the node-graph metaphor
              consistent and visually extends the pipeline. Option C is the
              simplest and requires no extra layout.
            */}
          </section>
        )}

        {/* Secondary issues (flagged) */}
        {step1 && step1.issues[1] && (
          <section className="mb-10 max-w-md">
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Also Flagged
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-4 opacity-70">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityColor(
                    step1.issues[1].severity
                  )}`}
                >
                  {step1.issues[1].severity}
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  {step1.issues[1].issue}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {step1.issues[1].evidence}
              </p>
            </div>
          </section>
        )}

        <footer className="text-xs text-slate-400">
          Pipeline: extract-issues → generate-variants → llm-judge. All
          gpt-4o-mini. Original baseline included in judging.
        </footer>
      </div>
    </div>
  );
}
