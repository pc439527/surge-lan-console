import { Link } from "react-router-dom";
import { Cable } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export function NoClientNotice({ page }: { page: string }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">{page}</h1>
      </header>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <Cable className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            没有可用的 Surge 连接。请先添加连接或启用演示模式。
          </p>
          <Button asChild>
            <Link to="/connections">打开连接</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
