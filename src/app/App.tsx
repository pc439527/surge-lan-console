import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/Toast";
import { useThemeSync } from "@/lib/theme";
import { Providers } from "./providers";
import { router } from "./router";
import { SurgeClientProvider } from "./surge-client-provider";

export default function App() {
  useThemeSync();

  return (
    <Providers>
      <SurgeClientProvider>
        <RouterProvider router={router} />
        <Toaster />
      </SurgeClientProvider>
    </Providers>
  );
}
