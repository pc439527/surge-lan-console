import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import { CoreApiError } from "@/lib/core-api";

const mockCoreApi = vi.hoisted(() => ({
  getAuthState: vi.fn(),
  setup: vi.fn(),
  unlock: vi.fn(),
  lock: vi.fn(),
}));

vi.mock("@/lib/core-api", () => ({
  coreApi: mockCoreApi,
  CoreApiError: class CoreApiError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number | null,
      message: string,
    ) {
      super(message);
      this.name = "CoreApiError";
    }
  },
}));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthGate>
        <div>已进入主界面</div>
      </AuthGate>
    </QueryClientProvider>,
  );
}

function unlockedState() {
  return { initialized: true, authenticated: true, sessionExpiresAt: null };
}
function lockedState() {
  return { initialized: true, authenticated: false, sessionExpiresAt: null };
}
function uninitializedState() {
  return { initialized: false, authenticated: false, sessionExpiresAt: null };
}

describe("AuthGate · 4 位数字 PIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("已初始化：输入 4 位 PIN 后自动提交解锁并进入主界面", async () => {
    mockCoreApi.getAuthState.mockResolvedValue(lockedState());
    mockCoreApi.unlock.mockResolvedValue(unlockedState());
    const user = userEvent.setup();

    renderGate();
    const input = await screen.findByLabelText("4 位数字 PIN");
    expect(screen.getByText("输入 4 位数字 PIN 解锁本地控制台")).toBeInTheDocument();

    await user.type(input, "4829");

    await waitFor(() => expect(mockCoreApi.unlock).toHaveBeenCalledWith("4829"));
    expect(await screen.findByText("已进入主界面")).toBeInTheDocument();
  });

  it("解锁失败：清空 PIN 并提示错误", async () => {
    mockCoreApi.getAuthState.mockResolvedValue(lockedState());
    mockCoreApi.unlock.mockRejectedValue(new CoreApiError("invalid_password", 401, "PIN 错误，请重试。"));
    const user = userEvent.setup();

    renderGate();
    const input = await screen.findByLabelText("4 位数字 PIN");
    await user.type(input, "0000");

    expect(await screen.findByText("PIN 错误，请重试。")).toBeInTheDocument();
    // 错误后触发重挂载，输入被清空
    const clearedInput = screen.getByLabelText("4 位数字 PIN");
    await waitFor(() => expect(clearedInput).toHaveValue(""));
    expect(mockCoreApi.unlock).toHaveBeenCalledWith("0000");
  });

  it("解锁限速（429）时展示服务端提示", async () => {
    mockCoreApi.getAuthState.mockResolvedValue(lockedState());
    mockCoreApi.unlock.mockRejectedValue(new CoreApiError("too_many_attempts", 429, "PIN 错误次数过多，请稍后再试。"));
    const user = userEvent.setup();

    renderGate();
    const input = await screen.findByLabelText("4 位数字 PIN");
    await user.type(input, "1111");

    expect(await screen.findByText("PIN 错误次数过多，请稍后再试。")).toBeInTheDocument();
  });

  it("首次设置：先创建后确认，两次一致后调用 setup", async () => {
    mockCoreApi.getAuthState.mockResolvedValue(uninitializedState());
    mockCoreApi.setup.mockResolvedValue(unlockedState());
    const user = userEvent.setup();

    renderGate();
    const input = await screen.findByLabelText("4 位数字 PIN");
    expect(screen.getByText("首次使用：设置你的 4 位数字 PIN")).toBeInTheDocument();

    await user.type(input, "1234");
    expect(await screen.findByText("再次输入相同的 4 位数字以确认")).toBeInTheDocument();
    expect(mockCoreApi.setup).not.toHaveBeenCalled();

    const confirmInput = await screen.findByLabelText("4 位数字 PIN");
    await waitFor(() => expect(confirmInput).toHaveValue(""));
    await user.type(confirmInput, "1234");

    await waitFor(() => expect(mockCoreApi.setup).toHaveBeenCalledWith("1234", "1234"));
    expect(await screen.findByText("已进入主界面")).toBeInTheDocument();
  });

  it("首次设置：两次输入不一致则回到创建步骤并提示", async () => {
    mockCoreApi.getAuthState.mockResolvedValue(uninitializedState());
    const user = userEvent.setup();

    renderGate();
    const input = await screen.findByLabelText("4 位数字 PIN");
    await user.type(input, "1234");
    expect(await screen.findByText("再次输入相同的 4 位数字以确认")).toBeInTheDocument();

    const confirmInput = screen.getByLabelText("4 位数字 PIN");
    await user.type(confirmInput, "5678");

    expect(await screen.findByText("两次输入的 PIN 不一致，请重新设置。")).toBeInTheDocument();
    expect(screen.getByText("输入 4 位数字，作为解锁 PIN")).toBeInTheDocument();
    expect(mockCoreApi.setup).not.toHaveBeenCalled();
    expect(mockCoreApi.unlock).not.toHaveBeenCalled();

    // 重新输入正确的 PIN 两次可以完成设置
    const retryInput = screen.getByLabelText("4 位数字 PIN");
    await user.type(retryInput, "1234");
    const finalConfirm = screen.getByLabelText("4 位数字 PIN");
    await user.type(finalConfirm, "1234");
    await waitFor(() => expect(mockCoreApi.setup).toHaveBeenCalledWith("1234", "1234"));
  });
});