import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLedgerClient } from '../AuditLedgerClient';
import { AuditLedgerError } from '../types';

function createMockTransport() {
  return vi.fn();
}

describe('JS SDK Integration Tests', () => {
  let client: AuditLedgerClient;
  let transport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transport = createMockTransport();
    client = new AuditLedgerClient(transport, 'CONTRACT_ID');
  });

  describe('Contract Initialization', () => {
    it('should initialize contract with valid params', async () => {
      transport.mockResolvedValueOnce(undefined);
      await client.initialize('GABCDEF123', 1000, 4096);
      expect(transport).toHaveBeenCalledWith('initialize', ['GABCDEF123', 1000, 4096]);
    });

    it('should initialize with default metadata bytes', async () => {
      transport.mockResolvedValueOnce(undefined);
      await client.initialize('GABCDEF123', 1000);
      expect(transport).toHaveBeenCalledWith('initialize', ['GABCDEF123', 1000, 4096]);
    });
  });

  describe('Event Logging', () => {
    it('should log a single event', async () => {
      const eventId = 'abc123def456';
      transport.mockResolvedValueOnce(eventId);
      const result = await client.logEvent('GSUBMITTER', 'payment', 'tx1');
      expect(result).toBe(eventId);
      expect(transport).toHaveBeenCalledWith('log_event', ['GSUBMITTER', 'payment', 'tx1']);
    });

    it('should log multiple events in batch', async () => {
      transport.mockResolvedValueOnce([0, 1, 2]);
      const events = [
        { submitter: 'GA', type: 'payment', metadata: 'a' },
        { submitter: 'GA', type: 'refund', metadata: 'b' },
        { submitter: 'GB', type: 'payment', metadata: 'c' },
      ];
      const indices = await client.logEvents(events);
      expect(indices).toEqual([0, 1, 2]);
      expect(transport).toHaveBeenCalledWith('log_events', [events]);
    });
  });

  describe('Event Retrieval', () => {
    it('should get total events count', async () => {
      transport.mockResolvedValueOnce(42);
      const total = await client.totalEvents();
      expect(total).toBe(42);
    });

    it('should get event by ID', async () => {
      const mockEvent = { index: 0, timestamp: 1000, event_type: 'payment', submitter: 'GA', metadata: 'tx1' };
      transport.mockResolvedValueOnce(mockEvent);
      const event = await client.getEvent('event_id');
      expect(event).toEqual(mockEvent);
    });

    it('should get event by type', async () => {
      const mockEvent = { index: 0, timestamp: 1000, event_type: 'payment', submitter: 'GA', metadata: 'first' };
      transport.mockResolvedValueOnce(mockEvent);
      const event = await client.getEventByType('payment', 0);
      expect(event).toEqual(mockEvent);
    });

    it('should get event count by type', async () => {
      transport.mockResolvedValueOnce(5);
      const count = await client.eventCount('payment');
      expect(count).toBe(5);
    });
  });

  describe('Statistics', () => {
    it('should get contract statistics', async () => {
      const stats = { totalEvents: 100, eventsLastHour: 10, eventsLastDay: 50 };
      transport.mockResolvedValueOnce(stats);
      const result = await client.getStatistics();
      expect(result).toEqual(stats);
    });
  });

  describe('Governance', () => {
    it('should set global max logs', async () => {
      transport.mockResolvedValueOnce(undefined);
      await client.setGlobalMaxLogs('GOWNER', 500);
      expect(transport).toHaveBeenCalledWith('set_global_max_logs', ['GOWNER', 500]);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on network error', async () => {
      transport
        .mockRejectedValueOnce(new TypeError('Network failure'))
        .mockResolvedValueOnce(10);

      const result = await client.totalEvents();
      expect(result).toBe(10);
      expect(transport).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 status', async () => {
      transport
        .mockRejectedValueOnce(new AuditLedgerError('Rate limited', undefined, 429))
        .mockResolvedValueOnce(10);

      const result = await client.totalEvents();
      expect(result).toBe(10);
      expect(transport).toHaveBeenCalledTimes(2);
    });

    it('should throw on non-retryable 400', async () => {
      transport.mockRejectedValueOnce(new AuditLedgerError('Bad request', undefined, 400));

      await expect(client.totalEvents()).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting retries', async () => {
      const error = new TypeError('Persistent failure');
      transport.mockRejectedValue(error);

      await expect(client.totalEvents()).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });

  describe('Error Handling', () => {
    it('should throw AuditLedgerError on transport error with code', async () => {
      transport.mockRejectedValueOnce(new AuditLedgerError('Not found', 404, 200));
      await expect(client.getEvent('bad_id')).rejects.toThrow(AuditLedgerError);
    });

    it('should handle malformed response gracefully', async () => {
      transport.mockRejectedValueOnce(new Error('Unexpected token'));
      await expect(client.totalEvents()).rejects.toThrow();
    });
  });
});
