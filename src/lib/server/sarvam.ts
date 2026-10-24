import type { AgentMode, ChatRequest } from "@/lib/agent/protocol";
import { toOpenAiTools, toolsForMode, type OpenAiTool } from "@/lib/agent/tools";
import { editSystemPrompt, planSystemPrompt, populateSystemPrompt } from "./prompts";

const SARVAM_URL = "https://api.sarvam.ai/v2/chat/completions";
const REASONING_MODELS = new Set(["sarvam-105b", "glm5.3", "deepseekv4.1-flash"]);
const MAX_TOKENS = 3000;
const PLAN_TOOL_CHOICE = { type: "function", function: { name: "plan_deck" } };

type ModeConfig = { system: (snapshot: string) => string; tools: OpenAiTool[]; toolChoice: unknown };

const MODES: Record<AgentMode, ModeConfig> = {
  edit: { system: editSystemPrompt, tools: toOpenAiTools(toolsForMode("edit")), toolChoice: "auto" },
  plan: { system: planSystemPrompt, tools: toOpenAiTools(toolsForMode("plan")), toolChoice: PLAN_TOOL_CHOICE },
  populate: { system: populateSystemPrompt, tools: toOpenAiTools(toolsForMode("populate")), toolChoice: "required" },
};

export function buildCompletionBody(request: ChatRequest) {
  const model = process.env.SARVAM_MODEL || "sarvam-105b";
  const mode = MODES[request.mode];
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    tool_choice: mode.toolChoice,
    ...(REASONING_MODELS.has(model) && { reasoning_effort: "low" }),
    messages: [{ role: "system", content: mode.system(request.deckSnapshot) }, ...request.messages],
    tools: mode.tools,
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
