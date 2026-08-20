import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { DataLoading, ErrorStateView } from "./DataState";

/**
 * Unified data-state view (OPTIMIZATION_PLAN §45 / Task 03).
 *
 * Wraps a TanStack Query result and renders the right state automatically:
 *   loading → DataLoading skeleton
 *   error   → dedicated state (network / auth / unsupported / parse)
 *   success + empty children → empty content
 *   success + children      → the feature content
 *
 * Every feature page can therefore stop hand-writing
 *   if (isLoading) ... if (error) ... if (!data) ...
 * while keeping "empty" distinct from "failed".
 */
interface DataViewProps<T> {
  query: UseQueryResult<T, unknown>;
  /** Rendered while loading (default: a 3-row skeleton). */
  loading?: ReactNode;
  /** Rendered when the query succeeded but produced no data. */
  empty: ReactNode;
  /** The feature content — receives the loaded data. */
  children: (data: T) => ReactNode;
  /** Shown in the error card next to "API:" (e.g. the endpoint path). */
  api?: string;
  /** Compact error/loading paddings for card-internal usage. */
  compact?: boolean;
  className?: string;
}

export function DataView<T>({ query, loading, empty, children, api, compact, className }: DataViewProps<T>) {
  if (query.isLoading) {
    return <div className={className}>{loading ?? <DataLoading compact={compact} rows={3} />}</div>;
  }

  if (query.isError) {
    return (
      <div className={className}>
        <ErrorStateView
          error={query.error}
          api={api}
          compact={compact}
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const data = query.data as T | undefined;
  const isEmpty = Array.isArray(data)
    ? data.length === 0
    : data === undefined || data === null || (typeof data === "object" && Object.keys(data as object).length === 0);

  if (isEmpty) {
    return <div className={className}>{empty}</div>;
  }

  return <div className={className}>{children(data as T)}</div>;
}