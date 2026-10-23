#!/usr/bin/env node
// One-off check that a Sarvam model streams usable tool calls.
// Usage: node scripts/sarvam-spike.mjs [model]   (reads SARVAM_API_KEY from .env.local)

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error("SARVAM_API_KEY is not set. Copy .env.example to .env.local and add your key.");
  process.exit(1);
}

const model = process.argv[2] ?? process.env.SARVAM_MODEL ?? "sarvam-105b";
const REASONING_MODELS = new Set(["glm5.3", "deepseekv4.1-flash"]);

const body = {
  model,
  stream: true,
  stream_options: { include_usage: true },
  max_tokens: 512,
  temperature: 0.2,
  tool_choice: "auto",
  ...(REASONING_MODELS.has(model) && { reasoning_effort: "low" }),
  messages: [
    { role: "system", content: "You edit slide decks. Always use the provided tools to make changes." },
    { role: "user", content: "Add a slide titled Pricing with a content layout." },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "add_slide",
        description: "Append a new slide to the deck.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            layout: { type: "string", enum: ["title", "content", "two-column", "comparison", "section", "chart-forward", "blank"] },
          },
          required: ["title", "layout"],
        },
      },
    },
  ],
};

const started = performance.now();
let res;
try {
  res = await fetch("https://api.sarvam.ai/v2/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify(body),
  });
} catch (error) {
  console.error(`Request failed: ${error.cause?.code ?? error.message}`);
  if (error.cause?.code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
    console.error("A TLS-inspecting proxy (e.g. Zscaler) is in the way. Run with `node --use-system-ca` or set NODE_USE_SYSTEM_CA=1.");
  }
  process.exit(1);
}

if (!res.ok || !res.body) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const toolCalls = [];
let text = "";
let reasoningChars = 0;
let chunks = 0;
let firstChunkMs;
let finishReason;
let usage;
let sampleToolChunk;

const decoder = new TextDecoder();
let buffer = "";

for await (const bytes of res.body) {
  buffer += decoder.decode(bytes, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;

    const event = JSON.parse(data);
    chunks++;
    firstChunkMs ??= performance.now() - started;
    if (event.usage) usage = event.usage;

    const choice = event.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;

    const delta = choice.delta ?? choice.message ?? {};
    if (delta.content) text += delta.content;
    if (delta.reasoning_content) reasoningChars += delta.reasoning_content.length;

    for (const part of delta.tool_calls ?? []) {
      sampleToolChunk ??= part;
      const index = part.index ?? toolCalls.length;
      const call = (toolCalls[index] ??= { id: undefined, name: "", arguments: "" });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name += part.function.name;
      if (part.function?.arguments) call.arguments += part.function.arguments;
    }
  }
}

const totalMs = performance.now() - started;

console.log(`\nModel:            ${model}`);
console.log(`Chunks:           ${chunks}`);
console.log(`First chunk:      ${Math.round(firstChunkMs ?? 0)} ms`);
console.log(`Total:            ${Math.round(totalMs)} ms`);
console.log(`Finish reason:    ${finishReason ?? "(none)"}`);
console.log(`Reasoning chars:  ${reasoningChars}`);
console.log(`Text reply:       ${text.trim() || "(none)"}`);
console.log(`Usage:            ${usage ? JSON.stringify(usage) : "(not reported)"}`);
console.log(`Sample tool delta: ${sampleToolChunk ? JSON.stringify(sampleToolChunk) : "(none)"}`);

if (toolCalls.length === 0) {
  console.log("\nRESULT: FAIL - no tool calls returned");
  process.exit(2);
}

let allValid = true;
for (const call of toolCalls.filter(Boolean)) {
  let parsed;
  try {
    parsed = JSON.parse(call.arguments);
  } catch {
    allValid = false;
  }
  console.log(`\nTool call ${call.id ?? "(no id)"}: ${call.name}`);
  console.log(`  arguments: ${call.arguments}`);
  console.log(`  valid JSON: ${parsed ? "yes" : "NO"}`);
}

console.log(`\nRESULT: ${allValid ? "PASS" : "FAIL - invalid tool arguments"}`);
process.exit(allValid ? 0 : 2);
