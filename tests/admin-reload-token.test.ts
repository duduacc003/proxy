import { beforeEach, afterEach, expect, test, mock } from "bun:test"

import { state } from "../src/lib/state"
import { server } from "../src/server"

const adminToken = "admin-token"
const webhookUrl = "http://n8n.local/webhook/github-token"

const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

beforeEach(() => {
  process.env.COPILOT_API_ADMIN_TOKEN = adminToken
  process.env.GITHUB_TOKEN_WEBHOOK_URL = webhookUrl
  process.env.GITHUB_TOKEN_WEBHOOK_BASIC_USER = "user@example.com"
  process.env.GITHUB_TOKEN_WEBHOOK_BASIC_PASS = "pass-123"
  process.env.GITHUB_TOKEN_WEBHOOK_BEARER = "webhook-bearer"
  process.env.GITHUB_TOKEN_WEBHOOK_KEYWORD = "keyword-123"

  state.githubToken = undefined
  state.copilotToken = undefined
  state.copilotTokenExpiresAt = undefined
  state.vsCodeVersion = "1.0.0"
  state.accountType = "individual"
  state.showToken = false

  const setTimeoutMock = mock(
    (_fn: unknown, _ms?: number) =>
      123 as unknown as ReturnType<typeof setTimeout>,
  )
  const clearTimeoutMock = mock((_id: unknown) => undefined)

  globalThis.setTimeout = setTimeoutMock as unknown as typeof setTimeout
  globalThis.clearTimeout = clearTimeoutMock as unknown as typeof clearTimeout

  const fetchMock = mock((url: string, init?: RequestInit) => {
    if (url === webhookUrl) {
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe("{}")

      const headers = new Headers(init?.headers)
      expect(headers.get("authorization")).toBe(
        `Basic ${Buffer.from("user@example.com:pass-123").toString("base64")}`,
      )
      expect(headers.get("x-webhook-bearer")).toBe("webhook-bearer")
      expect(headers.get("keyword")).toBe("keyword-123")

      return {
        ok: true,
        status: 200,
        json: () => [{ token: "ghp_test" }],
      }
    }

    if (url.includes("/copilot_internal/v2/token")) {
      return {
        ok: true,
        status: 200,
        json: () => ({
          token: "copilot_test",
          refresh_in: 3600,
          expires_at: 0,
        }),
      }
    }

    return {
      ok: false,
      status: 404,
      json: () => ({ error: "unexpected url" }),
    }
  })

  ;(globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout

  delete process.env.COPILOT_API_ADMIN_TOKEN
  delete process.env.GITHUB_TOKEN_WEBHOOK_URL
  delete process.env.GITHUB_TOKEN_WEBHOOK_BASIC_USER
  delete process.env.GITHUB_TOKEN_WEBHOOK_BASIC_PASS
  delete process.env.GITHUB_TOKEN_WEBHOOK_BEARER
  delete process.env.GITHUB_TOKEN_WEBHOOK_KEYWORD
})

test("POST /admin/reload-token requires X-Admin-Token", async () => {
  const req = new Request("http://localhost/admin/reload-token", {
    method: "POST",
  })

  const res = await server.fetch(req)
  expect(res.status).toBe(401)

  const body = (await res.json()) as { ok: boolean; error?: string }
  expect(body.ok).toBe(false)
})

test("POST /admin/reload-token reloads tokens and de-dupes interval", async () => {
  const req = new Request("http://localhost/admin/reload-token", {
    method: "POST",
    headers: {
      "X-Admin-Token": adminToken,
    },
  })

  const res1 = await server.fetch(req)
  expect(res1.status).toBe(200)
  expect(state.githubToken).toBe("ghp_test")
  expect(state.copilotToken).toBe("copilot_test")

  const res2 = await server.fetch(req)
  expect(res2.status).toBe(200)
  expect(state.githubToken).toBe("ghp_test")
  expect(state.copilotToken).toBe("copilot_test")

  const setTimeoutCalls = (
    globalThis.setTimeout as unknown as { mock: { calls: Array<unknown> } }
  ).mock.calls.length
  const clearTimeoutCalls = (
    globalThis.clearTimeout as unknown as { mock: { calls: Array<unknown> } }
  ).mock.calls.length

  expect(setTimeoutCalls).toBe(2)
  expect(clearTimeoutCalls).toBe(1)
})
