import { SurgeClient, type SurgeConnectionConfig } from "./surge-client";
import { SurgeError } from "./errors";

export type { SurgeConnectionConfig };

/** Create a client; throws SurgeError when apiKey is missing. */
export function createSurgeClient(config: SurgeConnectionConfig): SurgeClient {
  if (!config.apiKey) {
    throw new SurgeError("authentication", "API key is required.");
  }
  return new SurgeClient(config);
}

export type { SurgeError };
