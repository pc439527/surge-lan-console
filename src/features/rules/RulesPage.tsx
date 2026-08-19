import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { ENDPOINTS } from "@/api/endpoints";
import { NoClientNotice } from "@/features/shared/NoClientNotice";

export function RulesPage() {
  const { client } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const rulesQuery = useQuery({
    queryKey: [ENDPOINTS.rules],
    queryFn: () => surgeClient!.getRules(),
    enabled: !!surgeClient,
  });

  if (!client) return <NoClientNotice page="Rules" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">Rules</h1>
        <p className="mt-0.5 text-sm text-text-secondary">当前配置的活动规则集</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>规则集</CardTitle>
        </CardHeader>
        <CardContent>
          {rulesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Content</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-text-tertiary">Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesQuery.data?.map((rule, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2.5">
                        <Badge variant="muted" className="font-mono text-[11px]">{rule.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-primary">{rule.content || "—"}</td>
                      <td className="px-3 py-2.5 text-[13px] text-text-secondary">{rule.policy}</td>
                    </tr>
                  ))}
                  {rulesQuery.data?.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-10 text-center text-sm text-text-tertiary">
                        没有找到规则。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}