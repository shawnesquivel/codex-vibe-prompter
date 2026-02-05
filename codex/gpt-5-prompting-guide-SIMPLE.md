GPT-5 prompting guide (SIMPLE)

Purpose
- Use this as a short checklist for GPT-5 prompting in this repo.

Core defaults
- Prefer the Responses API for tool use and long-context flows.
- Keep instructions explicit and scoped to the task.
- Use low/medium reasoning for faster, smaller tasks; increase only when needed.

Agent behavior
- Decide how proactive you want the model to be.
- To reduce tool thrash: set clear stop criteria and keep search depth low.
- To increase autonomy: set persistence rules and discourage handbacks.

Tooling and context
- Tell the model which tools to use and when.
- Avoid unnecessary context; provide only what is needed.
- Use structured sections for complex instructions.

Coding outputs
- State coding standards up front (style, structure, constraints).
- Prefer readable, maintainable code.
- Keep plans short and actionable.

Markdown
- Ask for Markdown only when you need it.
- Keep formatting minimal and semantic.

Metaprompting
- For prompt fixes, ask GPT-5 to suggest minimal edits that change behavior.
