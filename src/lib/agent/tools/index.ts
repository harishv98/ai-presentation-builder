import { z } from "zod";
import type { AgentMode } from "../protocol";
import { chartTableTools } from "./chartTableTools";
import { elementTools } from "./elementTools";
import { planDeck } from "./planTool";
import type { AgentTool } from "./shared";
import { slideTools } from "./slideTools";

export type { AgentTool, ToolContext, ToolOutcome } from "./shared";

export type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const AGENT_TOOLS: AgentTool[] = [...slideTools, ...elementTools, ...chartTableTools];

const POPULATE_TOOL_NAMES = new Set(["add_element", "update_element", "add_chart", "update_chart_data", "add_table", "update_table"]);

const MODE_TOOLS: Record<AgentMode, AgentTool[]> = {
  edit: AGENT_TOOLS,
  plan: [planDeck],
  populate: AGENT_TOOLS.filter((tool) => POPULATE_TOOL_NAMES.has(tool.name)),
};

export const toolsForMode = (mode: AgentMode): AgentTool[] => MODE_TOOLS[mode];

export const findTool = (name: string, mode: AgentMode = "edit"): AgentTool | undefined =>
  MODE_TOOLS[mode].find((tool) => tool.name === name);

export function toOpenAiTools(tools: AgentTool[] = AGENT_TOOLS): OpenAiTool[] {
  return tools.map((tool) => {
    const parameters = z.toJSONSchema(tool.args) as Record<string, unknown>;
    delete parameters.$schema;
    return { type: "function", function: { name: tool.name, description: tool.description, parameters } };
  });
}
