import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY on the server." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const input = typeof body?.input === "string" ? body.input.trim() : "";
    const debug = Boolean(body?.debug);

    if (!input) {
      return NextResponse.json(
        { error: "Please provide a non-empty prompt." },
        { status: 400 }
      );
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input,
    });

    return NextResponse.json({
      text: response.output_text ?? "",
      trace: debug ? response : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
