import { ContractStatistics, Event, AuditLedgerError, EventPage, CacheStats } from './types';

export type Transport = (method: string, params: any[]) => Promise<any>;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface BatchProgress {
  completed: number;
  total: number;
}

export class AuditLedgerClient {
  transport: Transport;
  contractId?: string;
  maxRetries: number;
  baseDelayMs: number;
  private eventCache: Map<number, Event>;
  private totalEventsCache?: number;
  private cacheHits: number;
  private cacheMisses: number;
  private maxCacheSize: number;
  private maxPageSize: number;

  constructor(transport: Transport, contractId?: string, retryOptions: RetryOptions = {}) {
    this.transport = transport;
    this.contractId = contractId;
    this.maxRetries = retryOptions.maxRetries ?? 3;
    this.baseDelayMs = retryOptions.baseDelayMs ?? 500;
    this.eventCache = new Map();
    this.totalEventsCache = undefined;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.maxCacheSize = 128;
    this.maxPageSize = 100;
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
    let attempt = 0;
    for (;;) {
      try {
        return await this.transport(method, params);
      } catch (err) {
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

  async logEvent(submitter: string, eventType: string, metadata: string) : Promise<string> {
    return this.callTransport('log_event', [submitter, eventType, metadata]);
  }

  async logEvents(events: { submitter: string; type: string; metadata: string }[]): Promise<number[]> {
    return this.callTransport('log_events', [events]);
  }

  async getEvent(id: string): Promise<Event> {
    return this.callTransport('get_event', [id]);
  }

  async totalEvents(useCache = true): Promise<number> {
    if (useCache && this.totalEventsCache !== undefined) return this.totalEventsCache;
    const total = await this.callTransport<number>('total_events', []);
    this.totalEventsCache = total;
    return total;
  }

  async eventCount(type: string): Promise<number> {
    return this.callTransport('event_count', [type]);
  }

  async getEventByType(type: string, index: number): Promise<Event> {
    return this.callTransport('get_event_by_type', [type, index]);
  }

  async getEventByOrder(order: number): Promise<Event> {
    if (this.eventCache.has(order)) {
      this.cacheHits += 1;
      return this.eventCache.get(order)!;
    }
    this.cacheMisses += 1;
    const event = await this.callTransport<Event>('get_event_by_order', [order]);
    this.eventCache.set(order, event);
    while (this.eventCache.size > this.maxCacheSize) {
      const oldestKey = this.eventCache.keys().next().value as number | undefined;
      if (oldestKey === undefined) break;
      this.eventCache.delete(oldestKey);
    }
    return event;
  }

  async getEvents(offset = 0, limit = 50, cursor?: number): Promise<EventPage> {
    const start = cursor !== undefined ? Math.max(cursor, 0) : Math.max(offset, 0);
    const safeLimit = Math.max(1, Math.min(limit, this.maxPageSize));
    const total = await this.totalEvents();
    const end = Math.min(start + safeLimit, total);
    const items: Event[] = [];
    for (let index = start; index < end; index += 1) {
      items.push(await this.getEventByOrder(index));
    }
    return { items, total, offset: start, limit: safeLimit };
  }

  async *streamEvents(afterIndex = 0, pollIntervalMs = 5000): Promise<AsyncGenerator<Event>> {
    let cursor = Math.max(afterIndex, 0);
    while (true) {
      const total = await this.totalEvents();
      while (cursor < total) {
        yield await this.getEventByOrder(cursor);
        cursor += 1;
      }
      if (pollIntervalMs <= 0) return;
      await this.sleep(pollIntervalMs);
    }
  }

  filterEvents(events: Event[], options: { eventType?: string; submitter?: string; startTime?: number; endTime?: number; metadataQuery?: string } = {}): Event[] {
    const query = options.metadataQuery?.toLowerCase();
    return events.filter((event) => {
      if (options.eventType && event.event_type !== options.eventType) return false;
      if (options.submitter && event.submitter !== options.submitter) return false;
      if (options.startTime !== undefined && event.timestamp < options.startTime) return false;
      if (options.endTime !== undefined && event.timestamp > options.endTime) return false;
      if (query) {
        const metadata = event.metadata.toLowerCase();
        if (!metadata.includes(query)) return false;
      }
      return true;
    });
  }

  exportEvents(events: Event[], fmt: 'json' | 'csv' = 'json', streaming = false, onProgress?: (progress: { completed: number; total: number }) => void): string {
    const total = events.length;
    const rows = events.map((event, index) => {
      const record = {
        index: event.index,
        timestamp: event.timestamp,
        event_type: event.event_type,
        submitter: event.submitter,
        metadata: event.metadata,
        metadata_hex: Buffer.from(event.metadata).toString('hex'),
        event_hash: event.event_hash,
        prev_hash: event.prev_hash,
      };
      if (streaming) onProgress?.({ completed: index + 1, total });
      return record;
    });

    if (fmt === 'csv') {
      const headers = ['index', 'timestamp', 'event_type', 'submitter', 'metadata', 'metadata_hex', 'event_hash', 'prev_hash'];
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map((header) => String(row[header as keyof typeof row]).replace(/,/g, ' ')).join(','));
      }
      return lines.join('\n');
    }

    return JSON.stringify(rows);
  }

  cacheStats(): CacheStats {
    return { hits: this.cacheHits, misses: this.cacheMisses, size: this.eventCache.size };
  }

  invalidateCache() {
    this.eventCache.clear();
    this.totalEventsCache = undefined;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  async getStatistics(): Promise<ContractStatistics> {
    return this.callTransport('get_statistics', []);
  }

  // Governance helpers (examples)
  async setGlobalMaxLogs(caller: string, newMax: number) {
    return this.callTransport('set_global_max_logs', [caller, newMax]);
  }

  // Event watching via WebSocket
  watchEvents(wsUrl: string, type: string | null, cb: (evt: Event) => void) {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const msg = type ? { action: 'subscribe', type } : { action: 'subscribe_all' };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data as string);
        if (data.type === 'event_logged') cb(data.event as Event);
      } catch (e) {
        // ignore parse errors
      }
    };
    return ws;
  }

  // Batch submission with progress callback
  async submitBatch(events: { submitter: string; type: string; metadata: string }[], onProgress?: (p: BatchProgress) => void) {
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
