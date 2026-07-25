/**
 * Event Export Module (#273)
 *
 * Provides CSV, JSON, and streaming export of audit events
 * with progress tracking.
 */

import { resolvers } from "../graphql/src/resolvers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: "csv" | "json";
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  fields?: string[];
  stream?: boolean;
}

export interface ExportProgress {
  total: number;
  exported: number;
  percentage: number;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface ExportResult {
  data: string;
  contentType: string;
  filename: string;
  progress: ExportProgress;
}

const DEFAULT_FIELDS = [
  "index",
  "timestamp",
  "event_type",
  "submitter",
  "metadata",
  "event_hash",
  "prev_hash",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeCsvField(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function eventToCsvRow(event: Record<string, unknown>, fields: string[]): string {
  return fields.map((f) => escapeCsvField(event[f])).join(",");
}

function eventToJson(event: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    obj[f] = event[f];
  }
  return obj;
}

function getAllEvents(
  filter?: Record<string, unknown>,
  limit?: number,
  offset?: number
): Record<string, unknown>[] {
  const result = resolvers.Query.events(null, {
    limit: limit ?? 100000,
    offset: offset ?? 0,
    filter,
  }, null) as Record<string, unknown>[];
  return result;
}

// ── Export functions ──────────────────────────────────────────────────────────

export function exportCsv(options: ExportOptions): ExportResult {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const events = getAllEvents(options.filter, options.limit, options.offset);

  const header = fields.join(",");
  const rows = events.map((e) => eventToCsvRow(e, fields));
  const data = [header, ...rows].join("\n");

  return {
    data,
    contentType: "text/csv; charset=utf-8",
    filename: `audit-events-${Date.now()}.csv`,
    progress: {
      total: events.length,
      exported: events.length,
      percentage: 100,
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now(),
    },
  };
}

export function exportJson(options: ExportOptions): ExportResult {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const events = getAllEvents(options.filter, options.limit, options.offset);

  const mapped = events.map((e) => eventToJson(e, fields));
  const data = JSON.stringify({ data: mapped, total: mapped.length }, null, 2);

  return {
    data,
    contentType: "application/json; charset=utf-8",
    filename: `audit-events-${Date.now()}.json`,
    progress: {
      total: events.length,
      exported: events.length,
      percentage: 100,
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now(),
    },
  };
}

export function createStreamingExporter(options: ExportOptions) {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const progress: ExportProgress = {
    total: 0,
    exported: 0,
    percentage: 0,
    status: "running",
    startedAt: Date.now(),
  };

  const BATCH_SIZE = 100;

  return {
    progress,

    async *generate(): AsyncGenerator<string> {
      try {
        let offset = 0;
        const limit = options.limit ?? 100000;

        if (options.format === "csv") {
          yield fields.join(",") + "\n";
        } else {
          yield '{"data":[';
        }

        let isFirst = true;
        while (offset < limit) {
          const batch = getAllEvents(options.filter, BATCH_SIZE, offset);
          if (batch.length === 0) break;

          progress.total += batch.length;

          for (const event of batch) {
            if (options.format === "csv") {
              yield eventToCsvRow(event, fields) + "\n";
            } else {
              if (!isFirst) yield ",";
              yield JSON.stringify(eventToJson(event, fields));
              isFirst = false;
            }
            progress.exported++;
            progress.percentage = progress.total > 0
              ? Math.round((progress.exported / progress.total) * 100)
              : 0;
          }

          offset += BATCH_SIZE;

          if (batch.length < BATCH_SIZE) break;
        }

        if (options.format === "json") {
          yield '],"total":' + String(progress.exported) + "}";
        }

        progress.status = "completed";
        progress.completedAt = Date.now();
        progress.percentage = 100;
      } catch (err) {
        progress.status = "failed";
        progress.error = err instanceof Error ? err.message : String(err);
        throw err;
      }
    },
  };
}

export function exportEvents(options: ExportOptions): ExportResult {
  if (options.stream) {
    const exporter = createStreamingExporter(options);
    const chunks: string[] = {
      [Symbol.asyncIterator]() {
        return exporter.generate();
      },
    } as unknown as AsyncGenerator<string>;

    return {
      data: "",
      contentType: options.format === "csv" ? "text/csv" : "application/json",
      filename: `audit-events-${Date.now()}.${options.format}`,
      progress: exporter.progress,
    };
  }

  return options.format === "csv" ? exportCsv(options) : exportJson(options);
}
