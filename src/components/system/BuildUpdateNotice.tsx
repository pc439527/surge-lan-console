import { useEffect } from "react";
import { toast } from "sonner";
import {
  BUILD_INFO,
  compactBuildLabel,
  fetchRuntimeBuildInfo,
  hasRuntimeBuildChanged,
  type RuntimeBuildInfo,
} from "@/lib/version";

const TOAST_ID = "runtime-build-update";
const POLL_INTERVAL_MS = 60_000;

async function refreshToRuntimeBuild() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch {
      // A failed service-worker update must not block a normal page reload.
    }
  }
  window.location.reload();
}

function showBuildUpdate(runtime: RuntimeBuildInfo) {
  toast.info("检测到部署版本变化", {
    id: TOAST_ID,
    description: `当前 ${compactBuildLabel(BUILD_INFO)} · 服务器 ${compactBuildLabel(runtime)}。刷新后加载最新界面。`,
    duration: Infinity,
    closeButton: true,
    action: {
      label: "刷新",
      onClick: () => void refreshToRuntimeBuild(),
    },
  });
}

/**
 * Detects stale tabs / PWA bundles after a new container has been deployed.
 * `/version.json` is intentionally excluded from Workbox precache, and the
 * request itself is no-cache, so it reflects the files currently served by
 * Nginx rather than the JavaScript already loaded in this tab.
 */
export function BuildUpdateNotice() {
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const runtime = await fetchRuntimeBuildInfo();
        if (!cancelled && runtime && hasRuntimeBuildChanged(BUILD_INFO, runtime)) {
          showBuildUpdate(runtime);
        }
      } catch {
        // Build checks are advisory and must never make the console unavailable.
      }
    }

    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      toast.dismiss(TOAST_ID);
    };
  }, []);

  return null;
}
