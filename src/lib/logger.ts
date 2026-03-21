/**
 * Structured logger for server-side code.
 * Uses pino in production, falls back to console in development.
 * Import: import { log } from "@/lib/logger";
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function formatEntry(entry: LogEntry): string {
  const { level, msg, ...rest } = entry;
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `[${level.toUpperCase()}] ${msg}${extras}`;
}

function write(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  const entry: LogEntry = { level, msg, timestamp: new Date().toISOString(), ...data };

  if (process.env.NODE_ENV === "production") {
    // Structured JSON for log aggregation (CloudWatch, Datadog, etc.)
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[method](JSON.stringify(entry));
  } else {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : level === "debug" ? "debug" : "log";
    console[method](formatEntry(entry));
  }
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
};
