import type { Permit } from "@/types";
import { permitSummarySchema } from "@/lib/schemas";

export interface PermitSummary {
  riskLevel: "low" | "medium" | "high";
  summary: string;
  flags: string[];
  positives: string[];
}

/**
 * Generate an AI-powered permit summary using Claude.
 * Called once after payment — result stored in DB, not regenerated.
 */
export async function generatePermitSummary(
  permits: Permit[],
  address: string
): Promise<PermitSummary> {
  const permitData = permits.map((p) => ({
    record: p.record_number,
    type: p.type,
    status: p.status,
    filed: p.filed_date,
    description: p.description,
  }));

  const prompt = `You are a real estate due diligence expert analyzing permit records for a property.

Property: ${address}
Total permits found: ${permits.length}
Lookup date: ${new Date().toISOString().split("T")[0]}

Permit records:
${JSON.stringify(permitData, null, 2)}

Analyze these permit records and provide a due diligence summary. Focus on:
1. Expired permits (work started but never finaled/inspected — major red flag)
2. Building complaints or code violations
3. Unpermitted work signals (major renovation types with no corresponding permits)
4. Pattern of recent activity suggesting flip/renovation without proper permits
5. Positive signals (finaled permits showing work was properly completed)

Respond with a JSON object only, no markdown, no explanation outside the JSON:
{
  "riskLevel": "low" | "medium" | "high",
  "summary": "2-3 sentence plain-English summary a homebuyer can understand. Be direct and conclusive. State what the records show, not what they might mean.",
  "flags": ["specific red flag 1", "specific red flag 2"],
  "positives": ["positive signal 1", "positive signal 2"]
}

Risk level guide:
- low: All permits finaled or issued, no complaints, no expired permits
- medium: Some expired permits or incomplete work, but no complaints
- high: Building complaints, multiple expired permits, signs of unpermitted work

If permits.length === 0: riskLevel should be "medium", summary should note that zero permits may indicate no work was done OR that work was done without permits — cannot be determined from records alone.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text ?? "";

  try {
    const raw = JSON.parse(text.replace(/```json|```/g, "").trim());
    const validated = permitSummarySchema.safeParse(raw);
    if (validated.success) {
      return validated.data;
    }
    // Partial data — use what we can
    return {
      riskLevel: raw.riskLevel ?? "medium",
      summary: raw.summary ?? "Summary unavailable.",
      flags: Array.isArray(raw.flags) ? raw.flags : [],
      positives: Array.isArray(raw.positives) ? raw.positives : [],
    };
  } catch {
    return {
      riskLevel: "medium",
      summary: "Summary generation failed. Please review permit records directly.",
      flags: [],
      positives: [],
    };
  }
}
