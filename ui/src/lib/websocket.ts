"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import type { AuditEvent } from "@/types";

export type WSStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseWebSocketOptions {
  url?: string;
  eventTypes?: string[];
  onEvent?: (event: AuditEvent) => void;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket({
  url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000",
  eventTypes,
  onEvent,
  reconnectIntervalMs = 3000,
  maxReconnectAttempts = 10,
}: UseWebSocketOptions = {}) {
  const [status, setStatus] = useState<WSStatus>("disconnected");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        setReconnectCount(0);

        if (eventTypes && eventTypes.length > 0) {
          for (const type of eventTypes) {
            ws.send(JSON.stringify({ action: "subscribe", type }));
          }
        } else {
          ws.send(JSON.stringify({ action: "subscribe_all" }));
        }
      };

      ws.onmessage = (msg) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(msg.data);
          if (data.type === "event_logged" && data.event) {
            const event: AuditEvent = data.event;
            setEvents((prev) => [event, ...prev].slice(0, 100));
            onEvent?.(event);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setStatus("error");
      };

      wsRef.current = ws;
    } catch {
      setStatus("error");
      scheduleReconnect();
    }
  }, [url, eventTypes, onEvent, reconnectIntervalMs, maxReconnectAttempts]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    reconnectTimerRef.current = setTimeout(() => {
      setReconnectCount((prev) => {
        if (prev >= maxReconnectAttempts) return prev;
        connect();
        return prev + 1;
      });
    }, reconnectIntervalMs);
  }, [connect, reconnectIntervalMs, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const subscribe = useCallback((type: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "subscribe", type }));
    }
  }, []);

  const unsubscribe = useCallback((type: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "unsubscribe", type }));
    }
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    status,
    events,
    reconnectCount,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clearEvents,
  };
}
