import { RouterProvider } from "react-router-dom";
import { BuildUpdateNotice } from "@/components/system/BuildUpdateNotice";
import { Toaster } from "@/components/ui/Toast";
import { AuthGate } from "@/features/auth/AuthGate";
import { useThemeSync } from "@/lib/theme";
import { Providers } from "./providers";
import { router } from "./router";
import { SurgeClientProvider } from "./surge-client-provider";

export default function App() {
  useThemeSync();

  return (
    <Providers>
      <AuthGate>
        <SurgeClientProvider>
          <RouterProvider router={router} />
          <Toaster />
          <BuildUpdateNotice />
        </SurgeClientProvider>
      </AuthGate>
    </Providers>
  );
}
