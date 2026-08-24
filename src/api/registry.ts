import { API_DESCRIPTORS } from "./descriptors";
import type { ApiDescriptor } from "./descriptors";

/**
 * Endpoint Adapter Registry (v0.6.0, P0-2 — derived from API_DESCRIPTORS).
 *
 * ONE parser per endpoint, shared by the pages and Diagnostics:
 *
 *   HTTP → probeEndpoint → adapter.normalize(raw) → summarize
 *                                        │
 *                                        └─ the same function SurgeClient
 *                                           calls for the real page
 *
 * Diagnostics must NEVER parse independently — "Diagnostics OK" is only
 * meaningful if the page would render the same payload. Every adapter's
 * `normalize` therefore IS the page's parser (rules/events/dns reuse the
 * exported normalizers; requests and traffic reuse the exact Zod schemas the
 * client runs).
 *
 * `normalize` throws a SurgeError("parse-error") on unrecognized structure —
 * Diagnostics maps that to the "parse-error" state, pages to their error view.
 */
export interface EndpointAdapter<T = unknown> {
  /** Surge HTTP API path, e.g. "/v1/rules". */
  endpoint: string;
  /** Same normalizer the page / SurgeClient uses. Throws SurgeError on unrecognized shape. */
  normalize: (raw: unknown) => T;
  /** Short human summary, e.g. "72 raw · 72 parsed · 0 invalid". */
  summarize(data: T): string;
}

/** Gives each inline adapter its concrete view-model type for summarize(). */
function adapter<T>(a: EndpointAdapter<T>): EndpointAdapter<T> {
  return a;
}

/**
 * Probed by Diagnostics, in display order — exactly the descriptors that
 * declare a normalize+summarize pair in the descriptor registry.
 */
export const ENDPOINT_REGISTRY: EndpointAdapter<unknown>[] = (
  API_DESCRIPTORS as readonly ApiDescriptor<unknown>[]
)
  .filter(
    (d): d is ApiDescriptor<unknown> & { normalize: (raw: unknown) => unknown; summarize: (data: unknown) => string } =>
      typeof d.normalize === "function" && typeof d.summarize === "function",
  )
  .map((d) => adapter({ endpoint: d.path, normalize: d.normalize, summarize: d.summarize }));
