import { test, expect, mock, beforeEach } from "bun:test"

import type { ChatCompletionsPayload } from "../src/services/copilot/create-chat-completions"

import { state } from "../src/lib/state"
import { createChatCompletions } from "../src/services/copilot/create-chat-completions"

// Mock state
state.copilotToken = "test-token"
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

beforeEach(() => {
  state.initiatorWindows.clear()
  state.initiatorWindowMin = 70
  state.initiatorWindowMax = 100
})

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

test("sets X-Initiator to agent when last message is tool", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "tool", content: "tool call" },
    ],
    model: "gpt-test",
    user: "user-a",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (
    fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("agent")
})

test("sets X-Initiator to user when last message is user", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "user", content: "hello again" },
    ],
    model: "gpt-test",
    user: "user-b",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (
    fetchMock.mock.calls[1][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")
})

test("first call is user then agent within window for same user", async () => {
  state.initiatorWindowMin = 2
  state.initiatorWindowMax = 2

  const payload: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "start" }],
    model: "gpt-test",
    user: "user-c",
  }

  await createChatCompletions(payload)
  let headers = (
    fetchMock.mock.calls[2][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")

  await createChatCompletions(payload)
  headers = (fetchMock.mock.calls[3][1] as { headers: Record<string, string> })
    .headers
  expect(headers["X-Initiator"]).toBe("agent")
})
