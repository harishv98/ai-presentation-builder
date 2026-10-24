import { z } from "zod";

export const MAX_AGENT_STEPS = 12;
export const MAX_BODY_BYTES = 200_000;
export const HISTORY_MESSAGES = 6;
export const MAX_PROMPT_CHARS = 4000;

export const AGENT_MODES = ["plan", "populate", "edit"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

export const ChatMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1).max(MAX_PROMPT_CHARS) }),
  z.object({ role: z.literal("assistant"), content: z.string().nullable(), tool_calls: z.array(ToolCallSchema).optional() }),
  z.object({ role: z.literal("tool"), tool_call_id: z.string(), content: z.string() }),
]);

export const ChatRequestSchema = z.object({
  mode: z.enum(AGENT_MODES),
  messages: z.array(ChatMessageSchema).min(1).max(200),
  deckSnapshot: z.string().max(150_000),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatErrorBody = {
  error: string;
  code: "bad_request" | "too_large" | "rate_limited" | "not_configured" | "upstream";
  upstreamStatus?: number;
};
