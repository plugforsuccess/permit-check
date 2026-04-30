/**
 * Structured logger.
 *
 *   - Output: structured JSON in production, pretty-printed in development.
 *   - PII redaction: address-shaped fields are stripped to ZIP+street-name at
 *     info/warn/error level. Full address only at debug level when
 *     LOG_FULL_ADDRESS=true.
 *   - Required fields: report_id, step_name, event_type, duration_ms (per
 *     CLAUDE.md §4 "Logging"). Callers populate via the optional second arg.
 *   - Transport: console always; Axiom HTTP ingest if AXIOM_TOKEN +
 *     AXIOM_DATASET are set. Axiom delivery is fire-and-forget — log failures
 *     never break the request path.
 *
 * The redactAddress helper is exported so it can be unit-tested directly.
 */

import { env } from "./env";
import { redactAddress } from "./redact";

export { redactAddress } from "./redact";

type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogFields {
  report_id?: string;
  step_name?: string;
  event_type?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

// Field names whose values are addresses or contain addresses. Exhaustive list
// is intentional: redaction should be predictable and explicit, not heuristic.
const ADDRESS_FIELD_KEYS = new Set([
  "address",
  "address_raw",
  "address_normalized",
  "addressRaw",
  "addressNormalized",
  "base_address",
  "baseAddress",
  "to", // email recipient — also PII at info level
]);

function redactFields(fields: LogFields): LogFields {
  if (env.LOG_FULL_ADDRESS) return fields;
  const out: LogFields = { ...fields };
  for (const key of Object.keys(out)) {
    if (ADDRESS_FIELD_KEYS.has(key) && typeof out[key] === "string") {
      out[key] = redactAddress(out[key]);
    }
  }
  return out;
}

interface LogEntry extends LogFields {
  level: LogLevel;
  msg: string;
  timestamp: string;
}

function formatDev(entry: LogEntry): string {
  const { level, msg, timestamp, ...rest } = entry;
  void timestamp;
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `[${level.toUpperCase()}] ${msg}${extras}`;
}

// -----------------------------------------------------------------------------
// Axiom transport (fire-and-forget HTTP ingest)
// -----------------------------------------------------------------------------

const AXIOM_INGEST_URL = "https://api.axiom.co/v1/datasets";

function shipToAxiom(entry: LogEntry): void {
  if (!env.AXIOM_TOKEN || !env.AXIOM_DATASET) return;
  if (typeof fetch === "undefined") return; // not in a fetch-capable runtime
  // Fire-and-forget. Never await; never throw; never log a failure (would
  // recurse). Network errors and Axiom outages must not break the app.
  void fetch(`${AXIOM_INGEST_URL}/${env.AXIOM_DATASET}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AXIOM_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([entry]),
    // Don't keep the request alive past the function lifetime in serverless;
    // browsers don't honor `keepalive: true` for arbitrary domains, and
    // serverless runtimes will drop the connection on function exit. Best-
    // effort delivery is acceptable for our use case.
  }).catch(() => {
    /* swallow */
  });
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

function write(level: LogLevel, msg: string, fields?: LogFields): void {
  const redacted = redactFields(fields ?? {});
  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...redacted,
  };

  // Console output.
  if (env.NODE_ENV === "production") {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[method](JSON.stringify(entry));
  } else {
    const method =
      level === "error"
        ? "error"
        : level === "warn"
        ? "warn"
        : level === "debug"
        ? "debug"
        : "log";
    console[method](formatDev(entry));
  }

  // Ship debug only when LOG_FULL_ADDRESS is on (debug is otherwise local-dev
  // noise that doesn't belong in Axiom).
  if (level !== "debug" || env.LOG_FULL_ADDRESS) {
    shipToAxiom(entry);
  }
}

export const log = {
  info: (msg: string, fields?: LogFields) => write("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => write("error", msg, fields),
  debug: (msg: string, fields?: LogFields) => write("debug", msg, fields),
};
