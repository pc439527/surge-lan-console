import axios from "axios";
import { z } from "zod";

const authStateSchema = z.object({
  initialized: z.boolean(),
  authenticated: z.boolean(),
  sessionExpiresAt: z.string().nullable(),
});
const healthSchema = z.object({ status: z.literal("ok"), database: z.enum(["ok", "error"]), initialized: z.boolean() });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  protocol: z.enum(["http", "https"]),
  host: z.string(),
  port: z.number(),
  platform: z.enum(["ios", "tvos", "macos"]).nullable(),
  hasApiKey: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const connectionTestSchema = z.object({
  reachable: z.boolean(),
  authenticated: z.boolean(),
  latencyMs: z.number().nullable(),
  statusCode: z.number().nullable(),
});
const importResultSchema = z.object({ imported: z.number(), skipped: z.number() });

export type CoreAuthState = z.infer<typeof authStateSchema>;
export type CoreHealth = z.infer<typeof healthSchema>;
export type CoreConnection = z.infer<typeof connectionSchema>;
export type CoreConnectionTest = z.infer<typeof connectionTestSchema>;

export interface CoreConnectionInput {
  id?: string;
  name: string;
  protocol: "http" | "https";
  host: string;
  port: number;
  platform?: "ios" | "tvos" | "macos" | null;
  apiKey?: string;
}

export class CoreApiError extends Error {
  constructor(public readonly code: string, public readonly status: number | null, message: string) {
    super(message);
    this.name = "CoreApiError";
  }
}

const client = axios.create({
  baseURL: "/api",
  timeout: 15_000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

function normalizeError(error: unknown): CoreApiError {
  if (axios.isAxiosError(error)) {
    const parsed = errorSchema.safeParse(error.response?.data);
    if (parsed.success) return new CoreApiError(parsed.data.error.code, error.response?.status ?? null, parsed.data.error.message);
    if (!error.response) return new CoreApiError("core_unavailable", null, "无法连接 Surge LAN Console Core。");
    return new CoreApiError("core_request_failed", error.response.status, "Core 请求失败。");
  }
  return new CoreApiError("core_unknown_error", null, "Core 请求发生未知错误。");
}

async function request<T>(work: () => Promise<{ data: unknown }>, schema: z.ZodType<T>): Promise<T> {
  try {
    const response = await work();
    return schema.parse(response.data);
  } catch (error) {
    if (error instanceof CoreApiError) throw error;
    if (error instanceof z.ZodError) throw new CoreApiError("core_invalid_response", null, "Core 返回了无法识别的数据格式。");
    throw normalizeError(error);
  }
}

export const coreApi = {
  getHealth: (): Promise<CoreHealth> => request(() => client.get("/health"), healthSchema),
  getAuthState: (): Promise<CoreAuthState> => request(() => client.get("/auth/state"), authStateSchema),
  setup: (password: string, confirmPassword: string): Promise<CoreAuthState> => request(() => client.post("/auth/setup", { password, confirmPassword }), authStateSchema),
  unlock: (password: string): Promise<CoreAuthState> => request(() => client.post("/auth/unlock", { password }), authStateSchema),
  lock: (): Promise<CoreAuthState> => request(() => client.post("/auth/lock"), authStateSchema),

  listConnections: (): Promise<CoreConnection[]> => request(() => client.get("/connections"), z.array(connectionSchema)),
  createConnection: (input: CoreConnectionInput): Promise<CoreConnection> => request(() => client.post("/connections", input), connectionSchema),
  updateConnection: (id: string, input: Partial<CoreConnectionInput>): Promise<CoreConnection> => request(() => client.patch(`/connections/${encodeURIComponent(id)}`, input), connectionSchema),
  deleteConnection: (id: string): Promise<{ deleted: boolean }> => request(() => client.delete(`/connections/${encodeURIComponent(id)}`), z.object({ deleted: z.boolean() })),
  importConnections: (connections: CoreConnectionInput[]): Promise<{ imported: number; skipped: number }> => request(() => client.post("/connections/import", { connections }), importResultSchema),
  testConnection: (id: string): Promise<CoreConnectionTest> => request(() => client.post(`/connections/${encodeURIComponent(id)}/test`), connectionTestSchema),
};
