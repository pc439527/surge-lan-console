import axios from "axios";
import { z } from "zod";

const authStateSchema = z.object({
  initialized: z.boolean(),
  authenticated: z.boolean(),
  sessionExpiresAt: z.string().nullable(),
});

const healthSchema = z.object({
  status: z.literal("ok"),
  database: z.enum(["ok", "error"]),
  initialized: z.boolean(),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type CoreAuthState = z.infer<typeof authStateSchema>;
export type CoreHealth = z.infer<typeof healthSchema>;

export class CoreApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "CoreApiError";
  }
}

const client = axios.create({
  baseURL: "/api",
  timeout: 10_000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

function normalizeError(error: unknown): CoreApiError {
  if (axios.isAxiosError(error)) {
    const parsed = errorSchema.safeParse(error.response?.data);
    if (parsed.success) {
      return new CoreApiError(parsed.data.error.code, error.response?.status ?? null, parsed.data.error.message);
    }
    if (!error.response) {
      return new CoreApiError("core_unavailable", null, "无法连接 Surge LAN Console Core。 ");
    }
    return new CoreApiError("core_request_failed", error.response.status, "Core 请求失败。 ");
  }
  return new CoreApiError("core_unknown_error", null, "Core 请求发生未知错误。 ");
}

async function request<T>(work: () => Promise<{ data: unknown }>, schema: z.ZodType<T>): Promise<T> {
  try {
    const response = await work();
    return schema.parse(response.data);
  } catch (error) {
    if (error instanceof CoreApiError) throw error;
    throw normalizeError(error);
  }
}

export const coreApi = {
  getHealth(): Promise<CoreHealth> {
    return request(() => client.get("/health"), healthSchema);
  },

  getAuthState(): Promise<CoreAuthState> {
    return request(() => client.get("/auth/state"), authStateSchema);
  },

  setup(password: string, confirmPassword: string): Promise<CoreAuthState> {
    return request(() => client.post("/auth/setup", { password, confirmPassword }), authStateSchema);
  },

  unlock(password: string): Promise<CoreAuthState> {
    return request(() => client.post("/auth/unlock", { password }), authStateSchema);
  },

  lock(): Promise<CoreAuthState> {
    return request(() => client.post("/auth/lock"), authStateSchema);
  },
};
