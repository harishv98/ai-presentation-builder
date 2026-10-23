import { useChatStore, type TurnChanges } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { executeToolCall, type ToolExecution } from "./executeTool";
import { MAX_AGENT_STEPS, type ChatErrorBody, type ChatMessage, type ChatRequest, type ToolCall } from "./protocol";
import { revealAiChanges } from "./reveal";
import { clip, serializeForAI, type TurnMarks } from "./snapshot";
import { createTurnAccumulator, readSseEvents } from "./sse";

type TurnMeta = { txnId: string; label: string; applied: Set<string>; marks: TurnMarks; changes: string[] };
type StepResult = {
  text: string;
  toolCalls: ToolCall[];
  executions: ToolExecution[];
  onlyRepeats: boolean;
  truncated: boolean;
};

const REPEAT_RESULT = JSON.stringify({ ok: true, applied: "Already applied earlier in this reply; nothing changed" });

class AgentRequestError extends Error {
  status: number;
  body: Partial<ChatErrorBody>;
  retryAfter: string | null;

  constructor(res: Response, body: Partial<ChatErrorBody>) {
    super(body.error ?? `HTTP ${res.status}`);
    this.status = res.status;
    this.body = body;
    this.retryAfter = res.headers.get("retry-after");
  }
}

export function stopAgent(): void {
  useChatStore.getState().abort?.abort();
}

export async function runAgent(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  const meta: TurnMeta = {
    txnId: crypto.randomUUID(),
    label: `AI: ${clip(text, 40)}`,
    applied: new Set(),
    marks: new Map(),
    changes: [],
  };
  const turn: ChatMessage[] = [{ role: "user", content: text }];
  let reply = "";

  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const result = await runStep(step, [...useChatStore.getState().history, ...turn], abort.signal, meta);
      reply = result.text;
      turn.push({
        role: "assistant",
        content: result.text || null,
        ...(result.toolCalls.length > 0 && { tool_calls: result.toolCalls }),
      });
      for (const execution of result.executions) {
        turn.push({ role: "tool", tool_call_id: execution.callId, content: execution.content });
      }
      if (result.toolCalls.length === 0 || result.onlyRepeats) {
        if (!result.text.trim()) {
          const kept = meta.marks.size > 0 ? " Its changes are applied; ⌘Z undoes them." : "";
          const why = result.truncated
            ? "The AI ran out of room while thinking and didn't reply. Try a more specific request."
            : "The AI ended without replying.";
          notice("info", `${why}${kept}`, result.truncated && meta.marks.size === 0 ? text : undefined);
        }
        return;
      }
    }
    notice("info", `Stopped after ${MAX_AGENT_STEPS} steps. Changes so far are applied; ⌘Z undoes them.`);
  } catch (error) {
    if (abort.signal.aborted) notice("info", "Stopped. Changes made so far are kept; ⌘Z undoes them.");
    else notice("error", describeError(error), text);
  } finally {
    useChatStore.getState().endTurn(
      [
        { role: "user", content: text },
        { role: "assistant", content: reply.trim() || "(no reply)" },
      ],
      { prompt: text, changes: meta.changes },
    );
  }
}

async function runStep(step: number, messages: ChatMessage[], signal: AbortSignal, meta: TurnMeta): Promise<StepResult> {
  const { deck } = useDeckStore.getState();
  const currentSlideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  const request: ChatRequest = {
    mode: "edit",
    messages,
    deckSnapshot:
      serializeForAI(deck, currentSlideId, meta.marks) + describeRecentChanges(useChatStore.getState().recentChanges),
  };

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as Partial<ChatErrorBody>;
    throw new AgentRequestError(res, body);
  }

  const executions: ToolExecution[] = [];
  let repeats = 0;
  let assistantItemId: string | null = null;
  const accumulator = createTurnAccumulator(step, {
    onText(delta) {
      const chat = useChatStore.getState();
      assistantItemId ??= chat.pushItem({ kind: "assistant", text: "" });
      chat.appendText(assistantItemId, delta);
    },
    onToolCall(call) {
      const signature = callSignature(call);
      if (meta.applied.has(signature)) {
        repeats++;
        executions.push({
          callId: call.id,
          name: call.function.name,
          ok: true,
          summary: "",
          touched: [],
          added: [],
          previously: [],
          content: REPEAT_RESULT,
        });
        return;
      }
      const execution = executeToolCall(call, meta);
      executions.push(execution);
      if (execution.ok) {
        meta.applied.add(signature);
        const before = execution.previously.length > 0 ? ` (before: ${clip(execution.previously.join("; "), 400)})` : "";
        meta.changes.push(`${execution.summary}${before}`);
        for (const id of execution.touched) {
          meta.marks.set(id, execution.added.includes(id) || meta.marks.get(id) === "added" ? "added" : "edited");
        }
      }
      useChatStore.getState().pushItem({
        kind: "tool",
        ok: execution.ok,
        summary: execution.ok ? execution.summary : `${call.function.name} failed: ${execution.summary}`,
      });
      if (execution.ok) revealAiChanges(execution.touched);
    },
  });

  for await (const event of readSseEvents(res.body)) accumulator.push(event);
  const { text, toolCalls, usage, truncated } = accumulator.finish();
  if (process.env.NODE_ENV !== "production" && usage) console.debug(`[agent] step ${step + 1} usage`, usage);
  return { text, toolCalls, executions, truncated, onlyRepeats: toolCalls.length > 0 && repeats === toolCalls.length };
}

function describeRecentChanges(turns: TurnChanges[]): string {
  if (turns.length === 0) return "";
  const lines = turns.flatMap((turn) => [`For "${clip(turn.prompt, 80)}":`, ...turn.changes.map((change) => `- ${change}`)]);
  return `\n\nChanges from your earlier replies, oldest first ("before" is the state prior to that change):\n${lines.join("\n")}`;
}

function callSignature(call: ToolCall): string {
  try {
    return `${call.function.name}:${JSON.stringify(JSON.parse(call.function.arguments))}`;
  } catch {
    return `${call.function.name}:${call.function.arguments}`;
  }
}

function notice(tone: "info" | "error", text: string, retryPrompt?: string): void {
  useChatStore.getState().pushItem({ kind: "notice", tone, text, ...(retryPrompt && { retryPrompt }) });
}

function describeError(error: unknown): string {
  if (error instanceof AgentRequestError) {
    switch (error.body.code) {
      case "rate_limited":
        return `Too many requests. Try again in ${error.retryAfter ?? "a few"} seconds.`;
      case "not_configured":
        return "The server has no SARVAM_API_KEY. Add it to .env.local and restart the dev server.";
      case "too_large":
        return "The deck is too large to send to the AI.";
      case "upstream": {
        const status = error.body.upstreamStatus;
        if (status === 401 || status === 403) return "Sarvam rejected the API key.";
        if (status === 402 || status === 429) return `Sarvam refused the request (credits or rate limit): ${error.message}`;
        return `The AI service failed: ${error.message}`;
      }
      default:
        return error.message;
    }
  }
  if (error instanceof TypeError) return "Network error: could not reach the server.";
  return error instanceof Error ? error.message : String(error);
}
