import type { ChatRequest } from "@/lib/agent/protocol";
import { toOpenAiTools } from "@/lib/agent/tools";
import { editSystemPrompt } from "./prompts";

const SARVAM_URL = "https://api.sarvam.ai/v2/chat/completions";
const REASONING_MODELS = new Set(["glm5.3", "deepseekv4.1-flash"]);
const EDIT_MAX_TOKENS = 1500;
const TOOLS = toOpenAiTools();

export function buildCompletionBody(request: ChatRequest) {
  const model = process.env.SARVAM_MODEL || "sarvam-105b";
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: EDIT_MAX_TOKENS,
    temperature: 0.2,
    tool_choice: "auto",
    ...(REASONING_MODELS.has(model) && { reasoning_effort: "low" }),
    messages: [{ role: "system", content: editSystemPrompt(request.deckSnapshot) }, ...request.messages],
    tools: TOOLS,
  };
}

export function callSarvam(body: unknown, apiKey: string, signal: AbortSignal): Promise<Response> {
  return fetch(SARVAM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
}
