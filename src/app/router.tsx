import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ConnectionsPage = lazy(() =>
  import("@/features/connection/ConnectionsPage").then((m) => ({ default: m.ConnectionsPage })),
);
const PoliciesPage = lazy(() =>
  import("@/features/policies/PoliciesPage").then((m) => ({ default: m.PoliciesPage })),
);
const RequestsPage = lazy(() =>
  import("@/features/requests/RequestsPage").then((m) => ({ default: m.RequestsPage })),
);
const TrafficPage = lazy(() =>
  import("@/features/traffic/TrafficPage").then((m) => ({ default: m.TrafficPage })),
);
const DnsPage = lazy(() => import("@/features/dns/DnsPage").then((m) => ({ default: m.DnsPage })));
const RulesPage = lazy(() =>
  import("@/features/rules/RulesPage").then((m) => ({ default: m.RulesPage })),
);
const ModulesPage = lazy(() =>
  import("@/features/modules/ModulesPage").then((m) => ({ default: m.ModulesPage })),
);
const ScriptsPage = lazy(() =>
  import("@/features/scripts/ScriptsPage").then((m) => ({ default: m.ScriptsPage })),
);
const ConfigurationPage = lazy(() =>
  import("@/features/profiles/ConfigurationPage").then((m) => ({ default: m.ConfigurationPage })),
);
const EventsPage = lazy(() =>
  import("@/features/events/EventsPage").then((m) => ({ default: m.EventsPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const DesignSystemPage = lazy(() =>
  import("@/features/design-system/DesignSystemPage").then((m) => ({ default: m.DesignSystemPage })),
);

function page(node: React.ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: page(<DashboardPage />) },
      { path: "policies", element: page(<PoliciesPage />) },
      { path: "requests", element: page(<RequestsPage />) },
      { path: "traffic", element: page(<TrafficPage />) },
      { path: "dns", element: page(<DnsPage />) },
      { path: "rules", element: page(<RulesPage />) },
      { path: "modules", element: page(<ModulesPage />) },
      { path: "scripts", element: page(<ScriptsPage />) },
      { path: "configuration", element: page(<ConfigurationPage />) },
      { path: "events", element: page(<EventsPage />) },
      { path: "connections", element: page(<ConnectionsPage />) },
      { path: "settings", element: page(<SettingsPage />) },
      { path: "design-system", element: page(<DesignSystemPage />) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);