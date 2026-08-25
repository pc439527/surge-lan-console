export type ConsoleEventType =
  | "device-offline"
  | "device-recovery"
  | "surge-authentication-error"
  | "dns-failure"
  | "dns-high-latency"
  | "dns-recovery"
  | "policy-node-unreachable"
  | "policy-node-recovery"
  | "event-warning"
  | "event-error"
  | "profile-reload-success"
  | "profile-reload-failure"
  | "scheduled-job-failure"
  | "scheduled-job-recovery"
  | "engine-restart"
  | "unauthorized-ban"
  | "daily-digest";

export interface ConsoleEvent {
  type: ConsoleEventType;
  fingerprint: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "error";
  recovery?: boolean;
  connectionId?: string | null;
  occurredAt?: string;
}

type EventListener = (event: ConsoleEvent) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: ConsoleEvent): void {
    const normalized = { ...event, occurredAt: event.occurredAt ?? new Date().toISOString() };
    for (const listener of this.listeners) {
      try {
        listener(normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        console.error(`[core] event listener failed: ${message}`);
      }
    }
  }
}
