"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface SSEEvent<T = unknown> {
  id: string;
  timestamp: string;
  data: T;
}

interface UseSSEOptions {
  /** Maximum number of events to keep in the buffer. Default: 50 */
  maxEvents?: number;
  /** Delay in milliseconds before attempting reconnection. Default: 5000 */
  reconnectDelay?: number;
}

interface UseSSEReturn<T> {
  events: SSEEvent<T>[];
  connected: boolean;
  clear: () => void;
}

let eventIdCounter = 0;

/**
 * Reusable SSE hook that connects to an EventSource endpoint,
 * collects events, auto-reconnects on failure, and caps the buffer.
 */
export function useSSE<T = unknown>(url: string, options: UseSSEOptions = {}): UseSSEReturn<T> {
  const { maxEvents = 50, reconnectDelay = 5000 } = options;

  const [events, setEvents] = useState<SSEEvent<T>[]>([]);
  const [connected, setConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      // Clean up any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(url);
      eventSourceRef.current = es;

      // "connected" event from the control plane SSE stream
      es.addEventListener("connected", () => {
        if (mountedRef.current) {
          setConnected(true);
        }
      });

      // Audit event from the stream
      es.addEventListener("audit-event", (event) => {
        if (!mountedRef.current) return;

        try {
          const data = JSON.parse(event.data) as T;
          const parsed = data as Record<string, unknown>;
          const id = `sse-${++eventIdCounter}`;
          const timestamp =
            typeof parsed.timestamp === "string" ? parsed.timestamp : new Date().toISOString();

          setEvents((prev) => {
            const next = [{ id, timestamp, data }, ...prev];
            return next.length > maxEvents ? next.slice(0, maxEvents) : next;
          });
        } catch {
          // Ignore malformed events
        }
      });

      es.onerror = () => {
        if (!mountedRef.current) return;

        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        // Auto-reconnect after delay
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, reconnectDelay);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [url, maxEvents, reconnectDelay]);

  return { events, connected, clear };
}
