import { z } from "zod";
import type { EventLogger } from "../events";
import type { PropertyFacts } from "../types";

export interface ToolContext {
  property: PropertyFacts;
  events: EventLogger;
}

export interface ToolDefinition<I extends z.ZodType, O> {
  name: string;
  description: string;
  inputSchema: I;
  execute: (input: z.infer<I>, ctx: ToolContext) => Promise<O>;
}

/**
 * Wrap a tool execution so that every call is logged (success or failure)
 * and input is always Zod-validated. Never throws — returns { error } instead.
 */
export async function runTool<I extends z.ZodType, O>(
  tool: ToolDefinition<I, O>,
  rawInput: unknown,
  ctx: ToolContext
): Promise<{ ok: true; output: O } | { ok: false; error: string }> {
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const error = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    await ctx.events.log("tool_failed", tool.name, { error, stage: "validation" });
    return { ok: false, error };
  }

  await ctx.events.log("tool_called", tool.name, { input: parsed.data });
  const started = Date.now();
  try {
    const output = await tool.execute(parsed.data, ctx);
    await ctx.events.log("tool_returned", tool.name, {
      duration_ms: Date.now() - started,
    });
    return { ok: true, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await ctx.events.log("tool_failed", tool.name, {
      error,
      duration_ms: Date.now() - started,
    });
    return { ok: false, error };
  }
}
