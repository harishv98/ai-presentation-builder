import { z } from "zod";
import { chartTableTools } from "./chartTableTools";
import { elementTools } from "./elementTools";
import type { AgentTool } from "./shared";
import { slideTools } from "./slideTools";

export type { AgentTool, ToolContext, ToolOutcome } from "./shared";

export type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const AGENT_TOOLS: AgentTool[] = [...slideTools, ...elementTools, ...chartTableTools];

const BY_NAME = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export const findTool = (name: string): AgentTool | undefined => BY_NAME.get(name);

export function toOpenAiTools(tools: AgentTool[] = AGENT_TOOLS): OpenAiTool[] {
  return tools.map((tool) => {
    const parameters = z.toJSONSchema(tool.args) as Record<string, unknown>;
    delete parameters.$schema;
    return { type: "function", function: { name: tool.name, description: tool.description, parameters } };
  });
}
