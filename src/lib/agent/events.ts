import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger";
import type { AgentEvent, AgentEventType } from "./types";

/**
 * Records agent events. Keeps an in-memory buffer for the caller and
 * optionally persists each event to `public.report_events` via Supabase.
 * Never throws — an event sink failure must not crash the agent loop.
 */
export class EventLogger {
  private events: AgentEvent[] = [];
  private reportId: string | null;
  private supabase: SupabaseClient | null;

  constructor(opts: { reportId?: string | null; supabase?: SupabaseClient | null } = {}) {
    this.reportId = opts.reportId ?? null;
    this.supabase = opts.supabase ?? null;
  }

  async log(
    event_type: AgentEventType,
    step_name?: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const evt: AgentEvent = {
      event_type,
      step_name,
      payload,
      created_at: new Date().toISOString(),
    };
    this.events.push(evt);

    log.info(`[agent] ${event_type}${step_name ? ` ${step_name}` : ""}`, payload);

    if (this.supabase && this.reportId) {
      try {
        await this.supabase.from("report_events").insert({
          report_id: this.reportId,
          event_type,
          step_name: step_name ?? null,
          payload: payload ?? null,
        });
      } catch (err) {
        log.warn("[agent] failed to persist event", { err: String(err) });
      }
    }
  }

  getEvents(): AgentEvent[] {
    return [...this.events];
  }
}
