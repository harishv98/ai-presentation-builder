// sarvam-105b sometimes writes its tool call into the message content as
// `<tool_call>name<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>` instead of streaming
// structured tool_calls. The reply is complete and already paid for, so recover it rather than
// telling the user the AI returned nothing.
const OPEN = "<tool_call>";
const VALUE_END = ["</arg_value>", "</arg_key>", "<arg_key>", "</tool_call>"];
const BARE_JSON = /^(-?\d|true$|false$|null$)/;

export type TaggedToolCall = { name: string; arguments: string };

/** Where the tag block starts, counting a trailing fragment of `<tool_call>` as the start. */
export function taggedStart(text: string): number {
  const at = text.indexOf(OPEN);
  if (at !== -1) return at;
  for (let len = Math.min(OPEN.length - 1, text.length); len > 0; len--) {
    if (text.endsWith(OPEN.slice(0, len))) return text.length - len;
  }
  return -1;
}

/**
 * Parses every tag block, tolerating a value the stream has not finished yet. Mid-stream, pass
 * `close: false` to leave the arguments object open, the way real streamed arguments arrive.
 */
export function parseTaggedToolCalls(text: string, close = true): TaggedToolCall[] {
  return text
    .split(OPEN)
    .slice(1)
    .map((block) => parseBlock(block, close))
    .filter((call): call is TaggedToolCall => call !== null);
}

function parseBlock(block: string, close: boolean): TaggedToolCall | null {
  const name = block.slice(0, firstIndexOf(block, ["\n", "<"]) ?? block.length).trim();
  if (!name) return null;
  const args: [key: string, value: string][] = [];
  for (let at = block.indexOf("<arg_key>"); at !== -1; at = block.indexOf("<arg_key>", at + 1)) {
    const keyEnd = block.indexOf("</arg_key>", at);
    if (keyEnd === -1) break;
    const key = block.slice(at + "<arg_key>".length, keyEnd).trim();
    const open = block.indexOf("<arg_value>", keyEnd);
    if (!key || open === -1) continue;
    const from = open + "<arg_value>".length;
    const value = block.slice(from, firstIndexOf(block, VALUE_END, from) ?? block.length).trim();
    const seen = args.findIndex(([previous]) => previous === key);
    // A value can be restarted mid-stream; the last one wins, in the slot the key first took.
    if (seen === -1) args.push([key, value]);
    else args[seen] = [key, value];
  }
  const body = args.map(([key, value]) => `${JSON.stringify(key)}:${asJson(value)}`).join(",");
  return { name, arguments: `{${body}${close ? "}" : ""}` };
}

function firstIndexOf(text: string, needles: string[], from = 0): number | null {
  const found = needles.map((needle) => text.indexOf(needle, from)).filter((at) => at !== -1);
  return found.length > 0 ? Math.min(...found) : null;
}

// Structured values are passed through verbatim so a half-streamed array still reads as partial JSON.
function asJson(value: string): string {
  const structured = value.startsWith("[") || value.startsWith("{") || value.startsWith('"') || BARE_JSON.test(value);
  return structured ? value : JSON.stringify(value);
}
