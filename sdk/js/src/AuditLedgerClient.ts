import { ContractStatistics, Event, AuditLedgerError } from './types';
import { Logger, LogLevel, LoggerOptions } from './logger';
import { EventValidator, ValidatorOptions, EventInput } from './validator';
import { SubscriptionManager, SubscriptionOptions, EventCallback, Subscription } from './subscriptions';
import { BatchProcessor, BatchItem, BatchProcessorOptions, BatchProcessorResult, ProgressCallback } from './batch';

export type Transport = (method: string, params: any[]) => Promise<any>;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface BatchProgress {
  completed: number;
  total: number;
}

export interface AuditLedgerClientOptions {
  retryOptions?: RetryOptions;
  /** Logging options (#237) */
  logging?: LoggerOptions;
  /** Validation options — pass an object to enable client-side validation (#232) */
  validation?: ValidatorOptions | false;
}

export class AuditLedgerClient {
  transport: Transport;
  contractId?: string;
  maxRetries: number;
  baseDelayMs: number;

  /** #237 — Logger */
  readonly logger: Logger;

  /** #232 — Validator (null when validation is disabled) */
  readonly validator: EventValidator | null;

  /** #231 — Subscription manager */
  readonly subscriptions: SubscriptionManager;

  constructor(transport: Transport, contractId?: string, retryOrOptions: RetryOptions | AuditLedgerClientOptions = {}) {
    this.transport = transport;
    this.contractId = contractId;

    // Support legacy RetryOptions shape as well as the new AuditLedgerClientOptions shape
    const opts = retryOrOptions as AuditLedgerClientOptions;
    const retry: RetryOptions =
      'maxRetries' in retryOrOptions || 'baseDelayMs' in retryOrOptions
        ? (retryOrOptions as RetryOptions)
        : (opts.retryOptions ?? {});

    this.maxRetries = retry.maxRetries ?? 3;
    this.baseDelayMs = retry.baseDelayMs ?? 500;

    // #237 — Logger
    this.logger = new Logger(opts.logging ?? {});

    // #232 — Validator (enabled by default)
    if (opts.validation === false) {
      this.validator = null;
    } else {
      this.validator = new EventValidator(opts.validation ?? {});
    }

    // #231 — Subscription manager
    this.subscriptions = new SubscriptionManager({ logger: this.logger });
  }

  static fromRpc(rpcUrl: string, contractId?: string, retryOptions: RetryOptions = {}) {
    const transport: Transport = async (method, params) => {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, params }),
        });
        if (!res.ok) throw new AuditLedgerError('Transport error', undefined, res.status);
        const json = await res.json();
        if (json.error) throw new AuditLedgerError(json.error.message, json.error.code, res.status);
        return json.result;
      } catch (err) {
        if (err instanceof AuditLedgerError) throw err;
        throw err;
      }
    };
    return new AuditLedgerClient(transport, contractId, retryOptions);
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(err: unknown) {
    if (err instanceof AuditLedgerError) {
      return err.status === 429 || err.status === 503;
    }
    if (err instanceof TypeError) return true;
    if (typeof err === 'object' && err !== null) {
      const error = err as { name?: string; code?: string; status?: number };
      if (error.status === 429 || error.status === 503) return true;
      if (error.name === 'FetchError' || error.name === 'NetworkError') return true;
      if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(error.code)) return true;
    }
    return false;
  }

  private async callTransport<T>(method: string, params: any[]): Promise<T> {
    // #237 — log request
    this.logger.logRequest(method, params);
    const start = Date.now();
    let attempt = 0;
    for (;;) {
      try {
        const result = await this.transport(method, params);
        // #237 — log response + performance
        const durationMs = Date.now() - start;
        this.logger.logResponse(method, result, durationMs);
        this.logger.logPerformance(method, durationMs);
        return result;
      } catch (err) {
        // #237 — log error with context
        this.logger.logError(method, err, { attempt });
        if (attempt >= this.maxRetries || !this.isRetryableError(err)) {
          throw err;
        }
        const delay = this.baseDelayMs * (2 ** attempt);
        attempt += 1;
        await this.sleep(delay);
      }
    }
  }

  async initialize(owner: string, globalMaxLogs: number, maxMetadataBytes: number = 4096) {
    return this.callTransport('initialize', [owner, globalMaxLogs, maxMetadataBytes]);
  }

  async logEvent(submitter: string, eventType: string, metadata: string): Promise<string> {
    // #232 — validate before submitting
    if (this.validator) {
      this.validator.validateOrThrow({ submitter, type: eventType, metadata });
    }
    return this.callTransport('log_event', [submitter, eventType, metadata]);
  }

  async logEvents(events: { submitter: string; type: string; metadata: string }[]): Promise<number[]> {
    // #232 — validate all events before submitting
    if (this.validator) {
      for (const ev of events) {
        this.validator.validateOrThrow({ submitter: ev.submitter, type: ev.type, metadata: ev.metadata });
      }
    }
    return this.callTransport('log_events', [events]);
  }

  async getEvent(id: string): Promise<Event> {
    return this.callTransport('get_event', [id]);
  }

  async totalEvents(): Promise<number> {
    return this.callTransport('total_events', []);
  }

  async eventCount(type: string): Promise<number> {
    return this.callTransport('event_count', [type]);
  }

  async getEventByType(type: string, index: number): Promise<Event> {
    return this.callTransport('get_event_by_type', [type, index]);
  }

  async getStatistics(): Promise<ContractStatistics> {
    return this.callTransport('get_statistics', []);
  }

  // Governance helpers (examples)
  async setGlobalMaxLogs(caller: string, newMax: number) {
    return this.callTransport('set_global_max_logs', [caller, newMax]);
  }

  // ── Event watching via WebSocket ─────────────────────────────────────────

  watchEvents(wsUrl: string, type: string | null, cb: (evt: Event) => void) {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const msg = type ? { action: 'subscribe', type } : { action: 'subscribe_all' };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data as string);
        if (data.type === 'event_logged') {
          const event = data.event as Event;
          cb(event);
          // #231 — also publish to client-side subscription manager
          this.subscriptions.publish(event);
        }
      } catch (e) {
        this.logger.warn('watchEvents: failed to parse message', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    return ws;
  }

  // ── #231 — Subscription management helpers ───────────────────────────────

  /**
   * Subscribe to events with optional filtering.
   * Events are delivered via `publish()` when using `watchEvents` or manual `publishEvent()`.
   */
  subscribe(options: SubscriptionOptions, callback: EventCallback): Subscription {
    return this.subscriptions.subscribe(options, callback);
  }

  /**
   * Cancel a subscription by ID.
   */
  cancelSubscription(id: string): boolean {
    return this.subscriptions.cancel(id);
  }

  /**
   * Manually publish an event to all active subscriptions (useful for testing/polling).
   */
  publishEvent(event: Event): void {
    this.subscriptions.publish(event);
  }

  // ── #233 — Concurrent batch submission ───────────────────────────────────

  /**
   * Submit events with configurable concurrency, progress tracking, and error isolation.
   * Each event is submitted independently; a failure does not abort remaining items.
   *
   * @param events     Events to submit
   * @param options    Batch processing options (concurrency, onProgress, etc.)
   */
  async submitBatchConcurrent<T = undefined>(
    events: BatchItem<T>[],
    options: BatchProcessorOptions = {},
  ): Promise<BatchProcessorResult<T>> {
    const processor = new BatchProcessor<T>({ logger: this.logger, ...options });
    return processor.process(events, (item) =>
      this.logEvent(item.submitter, item.type, item.metadata),
    );
  }

  /**
   * Legacy sequential batch submission with progress callback (preserved for backwards compat).
   */
  async submitBatch(
    events: { submitter: string; type: string; metadata: string }[],
    onProgress?: (p: BatchProgress) => void,
  ) {
    const total = events.length;
    let completed = 0;
    for (const ev of events) {
      await this.logEvent(ev.submitter, ev.type, ev.metadata);
      completed++;
      onProgress?.({ completed, total });
    }
  }
}

export default AuditLedgerClient;
