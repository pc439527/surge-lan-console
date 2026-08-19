import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ENDPOINTS } from "@/api/endpoints";
import type { OutboundMode } from "@/api/types";
import { useSurgeClient } from "@/app/surge-client-context";
import { useOutboundModeQuery } from "./dashboard-queries";

const MODES: { value: OutboundMode; label: string; hint: string }[] = [
  { value: "rule", label: "Rule（规则）", hint: "按规则集分流" },
  { value: "proxy", label: "Proxy（代理）", hint: "全部走代理" },
  { value: "direct", label: "Direct（直连）", hint: "全部直连" },
];

export function OutboundModeControl() {
  const client = useSurgeClient();
  const queryClient = useQueryClient();
  const modeQuery = useOutboundModeQuery();
  const [open, setOpen] = useState(false);

  const setMode = useMutation({
    mutationFn: async (mode: OutboundMode) => {
      await client!.setOutboundMode(mode);
    },
    onSuccess: (_data, mode) => {
      queryClient.setQueryData([ENDPOINTS.outbound], mode);
      toast.success(`出站模式 → ${mode}`);
      setOpen(false);
    },
    onError: () => toast.error("切换出站模式失败"),
  });

  const current = modeQuery.data ?? "rule";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="glass" size="sm" className="uppercase">
          {current}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,280px)]">
        <DialogHeader>
          <DialogTitle className="text-sm">出站模式</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode.mutate(m.value)}
              disabled={setMode.isPending}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm outline-none transition-colors duration-hover focus-visible:ring-2 focus-visible:ring-accent/50",
                current === m.value ? "bg-accent/12 text-accent" : "text-text-primary hover:bg-surface",
              )}
            >
              <span className="flex flex-col items-start">
                <span className="capitalize">{m.label}</span>
                <span className="text-[11px] font-normal text-text-tertiary">{m.hint}</span>
              </span>
              {current === m.value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}