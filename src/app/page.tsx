"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [trace, setTrace] = useState<object | null>(null);
  const [debug, setDebug] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOutput("");
    setTrace(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, debug }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Request failed.");
      }

      setOutput(data?.text ?? "");
      setTrace(data?.trace ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f4f1ff_0%,_#fdfbf7_45%,_#f1f5f9_100%)] px-6 py-12 text-slate-950">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Vibe Prompter
          </p>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold leading-tight">
              Simple GPT-5 prompt runner
            </h1>
            <p className="max-w-2xl text-base text-slate-600">
              Drop in a prompt, send it to GPT-5 using the OpenAI SDK, and see
              both the output and the full response trace when you need it.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-200/50 backdrop-blur">
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-3">
              <span className="text-sm font-medium text-slate-700">
                Prompt
              </span>
              <textarea
                className="min-h-[160px] resize-y rounded-2xl border border-slate-200 bg-white p-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="Ask anything. Be specific to get better answers."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                required
              />
            </label>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={loading}
              >
                {loading ? "Running" : "Run prompt"}
              </button>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                  checked={debug}
                  onChange={(event) => setDebug(event.target.checked)}
                />
                Debug mode (return full trace)
              </label>
            </div>
          </form>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Output
              </h2>
              {output && (
                <span className="text-xs text-slate-400">GPT-5</span>
              )}
            </div>
            {error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : output ? (
              <p className="whitespace-pre-wrap text-base text-slate-800">
                {output}
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                Your response will appear here.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Debug Trace
              </h2>
              <span className="text-xs text-slate-400">Raw JSON</span>
            </div>
            {trace ? (
              <pre className="max-h-[380px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(trace, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-slate-400">
                Enable debug mode to see the full response payload.
              </p>
            )}
          </div>
        </section>

        <footer className="text-xs text-slate-500">
          Requires <span className="font-semibold">OPENAI_API_KEY</span> on the
          server. Debug mode returns the full response object for inspection.
        </footer>
      </main>
    </div>
  );
}
