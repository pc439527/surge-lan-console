/** Unified error model (PROJECT_SPEC §9). */
export type SurgeErrorKind =
  | "connection"
  | "authentication"
  | "timeout"
  | "api"
  | "unsupported"
  | "browser-security";

export class SurgeError extends Error {
  readonly kind: SurgeErrorKind;
  readonly status?: number;
  readonly detail?: unknown;

  constructor(kind: SurgeErrorKind, message: string, options?: { status?: number; detail?: unknown }) {
    super(message);
    this.name = "SurgeError";
    this.kind = kind;
    this.status = options?.status;
    this.detail = options?.detail;
  }
}

export function toFriendlyMessage(error: unknown): string {
  if (error instanceof SurgeError) {
    return error.message;
  }
  return "An unexpected error occurred.";
}
