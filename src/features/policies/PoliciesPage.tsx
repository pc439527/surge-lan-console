import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { policyLatencyView } from "@/lib/request";
import {
  useGroupSelectionsQuery,
  usePolicyGroupsQuery,
  usePolicyTestResultsQuery,
  useSelectPolicyMutation,
  useTestGroupMutation,
} from "./policies-queries";

export function PoliciesPage() {
  const { client } = useSurgeClientState();
  const groups = usePolicyGroupsQuery();
  const groupNames = groups.data?.map((g) => g.name) ?? [];
  const selections = useGroupSelectionsQuery(groupNames);
  const selectPolicy = useSelectPolicyMutation();
  const testGroup = useTestGroupMutation();

  const [expanded, setExpanded] = useState<string | null>(null);
  // Groups the user has tested this session — enables the test-results query
  // (PROJECT_SPEC §6.3 latency grading, without polling before first use).
  const [testedGroups, setTestedGroups] = useState<Set<string>>(() => new Set());
  const testResults = usePolicyTestResultsQuery(testedGroups.size > 0);

  if (!client) return <NoClientNotice page="Policies" />;

  const loading = groups.isLoading;

  const handleTest = (groupName: string) => {
    setTestedGroups((prev) => new Set(prev).add(groupName));
    testGroup.mutate(groupName);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">Policies</h1>
          <p className="mt-0.5 text-sm text-text-secondary">策略组及其选项 · 延迟分级：&lt;100 绿 / 100–250 橙 / &gt;250 红</p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.data?.map((group) => {
            const selected = selections.data?.[group.name];
            const groupResults = testResults.data?.[group.name];
            return (
              <Card key={group.name} className="p-0">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{group.name}</CardTitle>
                  <Badge>{selected ?? "—"}</Badge>
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === group.name ? null : group.name)}
                    className="flex w-full items-center justify-between rounded-sm border border-border bg-elevated/50 px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
                  >
                    {expanded === group.name ? "收起策略" : "展开策略"}
                    <span className="text-xs text-text-tertiary">{group.policies.length}</span>
                  </button>

                  {expanded === group.name && (
                    <div className="mt-2 space-y-1">
                      {group.policies.map((policyName) => {
                        const isSelected = selected === policyName;
                        const latency = policyLatencyView(groupResults?.[policyName]);
                        return (
                          <div
                            key={policyName}
                            className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-elevated/60"
                          >
                            <button
                              type="button"
                              onClick={() => selectPolicy.mutate({ group: group.name, policy: policyName })}
                              disabled={selectPolicy.isPending}
                              className="flex min-w-0 items-center gap-2 text-[13px] text-text-primary hover:text-accent"
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${isSelected ? "bg-accent" : "bg-text-tertiary/40"}`} />
                              <span className="truncate">{policyName}</span>
                            </button>
                            <div className="flex shrink-0 items-center gap-2">
                              {testedGroups.has(group.name) && (
                                <Badge variant={latency.tone} className="font-mono tabular-nums">
                                  {latency.label}
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleTest(group.name)}
                                disabled={testGroup.isPending}
                              >
                                {testGroup.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                测试
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
