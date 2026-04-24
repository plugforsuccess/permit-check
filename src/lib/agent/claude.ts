import { log } from "@/lib/logger";

/**
 * Thin fetch wrapper around the Anthropic Messages API.
 * Matches the pattern already used in lib/summary.ts — keeps the dep
 * footprint small. Returns the parsed JSON body and input/output token counts
 * so callers can aggregate cost.
 */

export interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ClaudeCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

const RETRYABLE_STATUS = new Set([429, 503, 529]);

export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const maxRetries = opts.maxRetries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 45_000;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens ?? 2000,
          temperature: opts.temperature ?? 0,
          system: opts.systemPrompt,
          messages: [{ role: "user", content: opts.userPrompt }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const retryable = RETRYABLE_STATUS.has(res.status);
        const body = await res.text().catch(() => "");
        if (!retryable || attempt > maxRetries) {
          throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
        }
        const retryAfter = Number(res.headers.get("retry-after")) || attempt * 3;
        log.warn("[claude] retryable status, backing off", {
          status: res.status,
          waitSeconds: retryAfter,
        });
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        model: data.model ?? opts.model,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt > maxRetries) break;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Claude call failed");
}

/**
 * Strip markdown fences if Claude wrapped the JSON payload.
 */
export function extractJson(text: string): string {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return cleaned;
  return cleaned.slice(firstBrace, lastBrace + 1);
}

/**
 * Per-million-token pricing (Apr 2026). Used only for approximate cost
 * accounting in agent_reports.llm_cost_usd — not for billing.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  if (!key) return 0;
  const p = PRICING[key];
  return (inputTokens * p.input) / 1_000_000 + (outputTokens * p.output) / 1_000_000;
}
