import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AppearanceSwitcher } from "@/components/ui/AppearanceSwitcher";
import { useState } from "react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">{children}</CardContent>
    </Card>
  );
}

/** Phase 02 showcase — all primitives, no Surge. */
export function DesignSystemPage() {
  const [switched, setSwitched] = useState(false);
  const [seg, setSeg] = useState<"one" | "two" | "three">("one");

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">设计系统</h1>
          <p className="text-sm text-text-secondary">Phase 02 — Liquid Glass 与 Token 基础组件</p>
        </div>
        <AppearanceSwitcher />
      </header>

      <Section title="Buttons">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="glass">Glass</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="Badges">
        <Badge>Default</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="danger">Danger</Badge>
        <Badge variant="muted">Muted</Badge>
      </Section>

      <Section title="Input & Select">
        <Input placeholder="Search requests..." className="w-64" />
        <Select defaultValue="rule">
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rule">Rule</SelectItem>
            <SelectItem value="proxy">Proxy</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Switch & Segmented Control">
        <div className="flex items-center gap-2">
          <Switch checked={switched} onCheckedChange={setSwitched} aria-label="Toggle" />
          <span className="text-sm text-text-secondary">{switched ? "On" : "Off"}</span>
        </div>
        <SegmentedControl
          label="Demo"
          options={[
            { value: "one" as const, label: "One" },
            { value: "two" as const, label: "Two" },
            { value: "three" as const, label: "Three" },
          ]}
          value={seg}
          onChange={setSeg}
        />
      </Section>

      <Section title="Skeleton">
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>

      <Section title="Dialog & Drawer & Toast">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear DNS Cache?</DialogTitle>
              <DialogDescription>This will flush all cached DNS entries.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Clear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="secondary">Open Drawer</Button>
          </DrawerTrigger>
          <DrawerContent side="right">
            <DrawerHeader>
              <DrawerTitle>Request Detail</DrawerTitle>
              <DrawerDescription>Overview of the selected request.</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <p className="text-sm text-text-secondary">Drawer body — Liquid Glass layer.</p>
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        <Button variant="secondary" onClick={() => toast.success("Connected · 18ms")}>
          Show Toast
        </Button>
      </Section>
    </div>
  );
}