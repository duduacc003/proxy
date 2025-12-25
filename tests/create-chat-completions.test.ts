import { test, expect, mock, beforeEach } from "bun:test"

import type { ChatCompletionsPayload } from "../src/services/copilot/create-chat-completions"

import { conversationManager } from "../src/lib/conversation"
import { state } from "../src/lib/state"
import { createChatCompletions } from "../src/services/copilot/create-chat-completions"

// Mock state
state.copilotToken = "test-token"
state.copilotTokenExpiresAt = Date.now() + 3600_000
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

// Helper to mock fetch
const fetchMock = mock(
  (_url: string, opts: { headers: Record<string, string> }) => {
    return {
      ok: true,
      json: () => ({ id: "123", object: "chat.completion", choices: [] }),
      headers: opts.headers,
    }
  },
)
// @ts-expect-error - Mock fetch doesn't implement all fetch properties
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock

beforeEach(() => {
  state.initiatorWindowMin = 70
  state.initiatorWindowMax = 100
  conversationManager.reset()
  fetchMock.mockClear()
})

test("first call to a model sets X-Initiator to user", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "hi" }],
    model: "gpt-test",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (
    fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")
})

test("subsequent calls to same model set X-Initiator to agent", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "hi" }],
    model: "gpt-test",
  }

  await createChatCompletions(payload)
  let headers = (
    fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")

  await createChatCompletions(payload)
  headers = (fetchMock.mock.calls[1][1] as { headers: Record<string, string> })
    .headers
  expect(headers["X-Initiator"]).toBe("agent")

  await createChatCompletions(payload)
  headers = (fetchMock.mock.calls[2][1] as { headers: Record<string, string> })
    .headers
  expect(headers["X-Initiator"]).toBe("agent")
})

test("different models have independent conversation state", async () => {
  const payloadA: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "hi" }],
    model: "model-a",
  }
  const payloadB: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "hi" }],
    model: "model-b",
  }

  await createChatCompletions(payloadA)
  let headers = (
    fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")

  await createChatCompletions(payloadB)
  headers = (fetchMock.mock.calls[1][1] as { headers: Record<string, string> })
    .headers
  expect(headers["X-Initiator"]).toBe("user")

  await createChatCompletions(payloadA)
  headers = (fetchMock.mock.calls[2][1] as { headers: Record<string, string> })
    .headers
  expect(headers["X-Initiator"]).toBe("agent")

  await createChatCompletions(payloadB)
  headers = (fetchMock.mock.calls[3][1] as { headers: Record<string, string> })
    .headers
  expect(headers["X-Initiator"]).toBe("agent")
})

test("includes x-conversation-id header", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "hi" }],
    model: "gpt-test",
  }
  await createChatCompletions(payload)
  const headers = (
    fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["x-conversation-id"]).toBeDefined()
  expect(headers["x-conversation-id"].length).toBeGreaterThan(0)
})
