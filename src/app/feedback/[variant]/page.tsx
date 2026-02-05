"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

/* Stubbed demo data — in production this would come from a DB/API */
type VariantStub = {
  response: string;
  prompt: string;
  userMessage: string;
};

const DEFAULT_USER_MSG =
  "I've been waiting over a week for my refund and nobody has gotten back to me. This is really frustrating — I just want my money back.";

const STUB_DATA: Record<string, VariantStub> = {
  "Targeted Fix": {
    userMessage: DEFAULT_USER_MSG,
    response:
      "I can understand how frustrating this situation must be for you, especially after you've already reached out about it. Let's get this sorted out. Can you please share the date you initially requested the refund?",
    prompt:
      "You are a supportive, empathetic customer support agent. Respond in a warm, human tone. When a customer expresses frustration, validate their specific feelings first — name the emotion and the situation causing it. Ask a brief clarifying question if needed, and provide the next best step. Keep responses concise and practical.",
  },
  "Technique Injection": {
    userMessage: DEFAULT_USER_MSG,
    response:
      "I completely understand why you're feeling upset — it's really frustrating to wait for something that should be resolved! Let's take a moment to get this sorted out.",
    prompt:
      "You are a supportive, empathetic customer support agent. Follow these steps for every response:\n1. ACKNOWLEDGE — Identify and name the customer's emotion. Mirror it back.\n2. VALIDATE — Explain why their frustration is reasonable.\n3. ACT — Provide one clear, concrete next step to resolve their issue.\nKeep responses concise and human.",
  },
  "Self-Reflection Rubric": {
    userMessage: DEFAULT_USER_MSG,
    response:
      "I completely understand how frustrating this must be for you, and I'm really sorry for the inconvenience. Let's make sure we get this sorted out as quickly as possible. Can you please provide me with your order number?",
    prompt:
      "You are a supportive, empathetic customer support agent. Before sending your response, self-check:\n- Does my reply acknowledge the customer's specific emotion?\n- Am I offering a concrete next step, not just apologizing?\n- Would a real person say this, or does it sound robotic?\nIf any answer is no, revise before responding. Keep responses concise and practical.",
  },
  "Original (Baseline)": {
    userMessage: DEFAULT_USER_MSG,
    response:
      "I'm really sorry to hear that you're feeling frustrated — it's completely understandable. It can be so annoying when things don't go as planned. Could you please share your order number again? I want to make sure we resolve this for you.",
    prompt:
      "You are a supportive, empathetic customer support agent. Respond in a warm, human tone. Acknowledge emotions, ask a brief clarifying question if needed, and provide the next best step. Keep responses concise and practical.",
  },
};

export default function FeedbackPage() {
  const params = useParams();
  const variantName = decodeURIComponent(
    (params.variant as string) ?? "Unknown"
  );

  // Strip prefix like "Variant A (Targeted Fix)" → look up "Targeted Fix"
  const lookupKey =
    Object.keys(STUB_DATA).find((k) => variantName.includes(k)) ?? variantName;
  const stub = STUB_DATA[lookupKey];
  const userMessage = stub?.userMessage ?? DEFAULT_USER_MSG;
  const responseText =
    stub?.response ??
    "Thank you for reaching out. I understand your frustration and I'm here to help. Could you share a few more details so I can look into this right away?";

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // Stub — would POST to an API in production
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f4f1ff_0%,#fdfbf7_45%,#f1f5f9_100%)] px-4 py-12 text-slate-950">
      <div className="mx-auto w-full max-w-lg">
        {/* Human-in-the-Loop banner */}
        <div className="mb-6 flex items-center justify-center gap-3 rounded-full border border-indigo-200 bg-indigo-50 px-5 py-2.5">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-indigo-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
            Human-in-the-Loop Review
          </span>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold">
            How does this AI response feel?
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your feedback helps us pick the best prompt for our support agent.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Variant:{" "}
            <span className="font-medium text-slate-600">{variantName}</span>
          </p>
        </div>

        {/* Chat UI */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
          <div className="flex flex-col gap-4">
            {/* User message */}
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                You
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3">
                <p className="text-sm leading-relaxed text-slate-700">
                  {userMessage}
                </p>
              </div>
            </div>

            {/* AI response */}
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                AI
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-indigo-50 px-4 py-3">
                <p className="text-sm leading-relaxed text-slate-700">
                  {responseText}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feedback form */}
        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
          >
            {/* Star rating */}
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Rate this response
            </p>
            <div className="mb-5 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg transition ${
                    rating != null && n <= rating
                      ? "border-amber-400 bg-amber-50 text-amber-500"
                      : "border-slate-200 text-slate-300 hover:border-slate-300"
                  }`}
                >
                  &#9733;
                </button>
              ))}
            </div>

            {/* Comment */}
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Comments{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Did the response feel empathetic? Was it helpful?"
              className="mb-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />

            <button
              type="submit"
              disabled={rating === null}
              className="w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Submit Feedback
            </button>
          </form>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-lg">
            <div className="mb-3 text-3xl">&#10003;</div>
            <h2 className="text-lg font-semibold text-emerald-800">
              Thank you!
            </h2>
            <p className="mt-1 text-sm text-emerald-600">
              Your feedback has been recorded.
            </p>
            <p className="mt-4 text-xs text-slate-400">
              Rating: {rating}/5
              {comment ? ` — "${comment}"` : ""}
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[10px] text-slate-400">
          Demo stub — feedback is not persisted.
        </p>
      </div>
    </div>
  );
}
