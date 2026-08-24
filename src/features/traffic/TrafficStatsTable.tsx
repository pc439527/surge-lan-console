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
        "inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-text-tertiary transition-colors duration-hover hover:text-text-primary",
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
 * connectors. Default sort is total traffic (in + out) descending. The name
 * column keeps a generous min-width so long connector names stay readable;
 * anything longer ellipsizes with a native title tooltip.
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
            className="block max-w-[60vw] truncate font-medium text-[13px] text-text-primary"
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

  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    "px-3 py-2.5 text-left align-middle",
                    header.column.id === "name" ? "min-w-[" + NAME_MIN_WIDTH[kind] + "px]" : "",
                  )}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
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
