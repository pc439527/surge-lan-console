import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import type { ConnectorTraffic } from "@/api/types";

/**
 * One table row: a network interface or policy connector entry.
 * Kept separate from ConnectorTraffic so sort accessors stay explicit.
 */
export type TrafficStatsRow = ConnectorTraffic & { name: string };

/** Name column keeps extra room for connector names (DIRECT / 香港节点 / ...). */
const NAME_MIN_WIDTH = { interface: 160, connector: 240 } as const;

function SortableHeader({
  label,
  column,
  align = "right",
}: {
  label: string;
  /** Minimal column surface needed for toggleSorting/getIsSorted. */
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className={cn(
        "touch-target inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-text-tertiary transition-colors duration-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        align === "right" ? "ml-auto" : "mr-auto",
      )}
      onClick={() => column.toggleSorting()}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Shared, sortable stats table used for both network interfaces and policy
 * connectors. Desktop keeps the dense sortable table. Mobile follows the
 * project HIG rule and reflows each row into a scan-friendly card instead of
 * requiring horizontal scrolling.
 */
export function TrafficStatsTable({
  rows,
  emptyMessage,
  kind,
}: {
  rows: TrafficStatsRow[];
  emptyMessage: string;
  kind: "interface" | "connector";
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "total", desc: true }]);

  const columns = useMemo<ColumnDef<TrafficStatsRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <SortableHeader label="名称" column={column} align="left" />,
        cell: ({ row }) => (
          <span
            title={row.original.name}
            className="block max-w-[60vw] truncate text-[13px] font-medium text-text-primary"
          >
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "out",
        header: ({ column }) => <SortableHeader label="上传" column={column} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-[13px] text-text-primary">{formatBytes(getValue<number>() ?? 0)}</span>
        ),
      },
      {
        accessorKey: "in",
        header: ({ column }) => <SortableHeader label="下载" column={column} />,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-[13px] text-text-primary">{formatBytes(getValue<number>() ?? 0)}</span>
        ),
      },
      {
        id: "total",
        accessorFn: (row) => (row.in ?? 0) + (row.out ?? 0),
        header: ({ column }) => <SortableHeader label="总计" column={column} />,
        cell: ({ row }) => (
          <span className="tabular-nums text-[13px] font-medium text-text-primary">
            {formatBytes((row.original.out ?? 0) + (row.original.in ?? 0))}
          </span>
        ),
      },
      {
        id: "currentSpeed",
        accessorFn: (row) => (row.inCurrentSpeed ?? 0) + (row.outCurrentSpeed ?? 0),
        header: ({ column }) => <SortableHeader label="当前速度" column={column} />,
        cell: ({ row }) => (
          <SpeedPair up={row.original.outCurrentSpeed ?? 0} down={row.original.inCurrentSpeed ?? 0} />
        ),
      },
      {
        id: "maxSpeed",
        accessorFn: (row) => (row.inMaxSpeed ?? 0) + (row.outMaxSpeed ?? 0),
        header: ({ column }) => <SortableHeader label="最高速度" column={column} />,
        cell: ({ row }) => (
          <SpeedPair up={row.original.outMaxSpeed ?? 0} down={row.original.inMaxSpeed ?? 0} />
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-surface px-4 py-8 text-center text-sm text-text-tertiary">
        {emptyMessage}
      </div>
    );
  }

  const sortedRows = table.getRowModel().rows;

  return (
    <>
      <div className="space-y-2 md:hidden">
        {sortedRows.map((row) => (
          <TrafficStatsCard key={row.id} row={row.original} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2.5 text-left align-middle"
                      style={header.column.id === "name" ? { minWidth: NAME_MIN_WIDTH[kind] } : undefined}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 transition-colors duration-hover last:border-b-0 hover:bg-elevated/50"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn("px-3 py-2.5 align-middle", cell.column.id === "name" ? "text-left" : "text-right")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TrafficStatsCard({ row }: { row: TrafficStatsRow }) {
  const total = (row.out ?? 0) + (row.in ?? 0);

  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary" title={row.name}>
            {row.name}
          </p>
          <p className="mt-0.5 text-xs text-text-tertiary">累计流量</p>
        </div>
        <p className="shrink-0 tabular-nums text-sm font-semibold text-text-primary">{formatBytes(total)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <TrafficStat label="上传" value={formatBytes(row.out ?? 0)} />
        <TrafficStat label="下载" value={formatBytes(row.in ?? 0)} />
        <div>
          <dt className="text-text-tertiary">当前速度</dt>
          <dd className="mt-1">
            <SpeedPair up={row.outCurrentSpeed ?? 0} down={row.inCurrentSpeed ?? 0} />
          </dd>
        </div>
        <div>
          <dt className="text-text-tertiary">最高速度</dt>
          <dd className="mt-1">
            <SpeedPair up={row.outMaxSpeed ?? 0} down={row.inMaxSpeed ?? 0} />
          </dd>
        </div>
      </dl>
    </article>
  );
}

function TrafficStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="mt-1 tabular-nums text-[13px] font-medium text-text-primary">{value}</dd>
    </div>
  );
}

/** Upload/download speed pair: arrow + value per second. */
function SpeedPair({ up, down }: { up: number; down: number }) {
  return (
    <div className="space-y-0.5">
      <div className="tabular-nums text-[13px] text-chart-upload">
        ↑ {formatBytes(up)}/s
      </div>
      <div className="tabular-nums text-[13px] text-chart-download">
        ↓ {formatBytes(down)}/s
      </div>
    </div>
  );
}
