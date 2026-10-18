/**
 * lib/admin-api/client 单测
 * ------------------------------------------------------------------
 * 验证 apiFetch 把浏览器层 fetch 异常（abort / Failed to fetch /
 * NetworkError）归一化为本地化中文消息，原 cause 通过 Error.cause
 * 字段传给调用方。控制台层用 console.warn 而非 console.error，避免
 * Next.js 16 dev overlay 把每次 transient throw 都报成错误。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";

describe("apiFetch error normalization", () => {
  let originalFetch: typeof fetch;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleWarnSpy.mockRestore();
  });

  it("normalizes 'Failed to fetch' to a localized message, warns, and preserves cause", async () => {
    const cause = new TypeError("Failed to fetch");
    globalThis.fetch = vi.fn(() => Promise.reject(cause)) as unknown as typeof fetch;

    const thrown = await apiFetch("/api/users").then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/^网络异常/);
    /* throw new Error(message, { cause }) —— 调用方拿到的 e.cause 仍是原 TypeError */
    expect(thrown!.cause).toBe(cause);
    /* console.warn 而不是 console.error —— 不触发 dev overlay */
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const logArgs = consoleWarnSpy.mock.calls[0]!;
    expect(logArgs[0]).toBe("[apiFetch]");
    expect(logArgs[1]).toBe("/api/users");
    /* 末位是原 err，不上 console.warn 也能从 cause 拿到，但 warn 一次更易 grep */
    expect(logArgs[logArgs.length - 1]).toBe(cause);
  });

  it("normalizes 'NetworkError' to '网络异常, 连不上后端'", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error("NetworkError when attempting to fetch resource.")),
    ) as unknown as typeof fetch;

    await expect(apiFetch("/api/users")).rejects.toThrow("网络异常，连不上后端");
  });

  it("normalizes DOMException AbortError to '请求已取消'", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new DOMException("aborted", "AbortError")),
    ) as unknown as typeof fetch;

    await expect(apiFetch("/api/users")).rejects.toThrow("请求已取消");
  });

  it("falls back to a generic 网络异常 for unknown throwables", async () => {
    /* 非 Error 实例被 reject 进 fetch 时也要兜底，
       否则外层 catch (e) { e.message } 会拿到 'undefined' */
    globalThis.fetch = vi.fn(() =>
      Promise.reject("plain string throw"),
    ) as unknown as typeof fetch;

    await expect(apiFetch("/api/users")).rejects.toThrow("网络异常");
  });

  it("passes through a successful Response unchanged", async () => {
    const fakeRes = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(fakeRes),
    ) as unknown as typeof fetch;

    const r = await apiFetch("/api/users");
    expect(r.status).toBe(200);
    expect(r).toBe(fakeRes);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
