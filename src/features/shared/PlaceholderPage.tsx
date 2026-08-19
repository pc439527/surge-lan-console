import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface PlaceholderPageProps {
  title: string;
  icon: LucideIcon;
  phase: string;
}

/** Temporary page until the feature lands in its roadmap phase. */
export function PlaceholderPage({ title, icon: Icon, phase }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[26px] font-semibold text-text-primary">{title}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-secondary">
            <Icon className="h-4 w-4" />
            Coming soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">{phase}</p>
        </CardContent>
      </Card>
    </div>
  );
}
