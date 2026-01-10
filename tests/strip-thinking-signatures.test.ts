import { describe, test, expect } from "bun:test"

import type {
  AnthropicMessagesPayload,
  AnthropicThinkingBlock,
} from "~/routes/messages/anthropic-types"

import { stripThinkingSignatures } from "~/routes/messages/handler"

describe("stripThinkingSignatures", () => {
  test("should clear signature from thinking blocks in assistant messages", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Hello",
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Let me think about this...",
              signature: "abc123signatureFromOtherProvider",
            },
            {
              type: "text",
              text: "Here is my response",
            },
          ],
        },
        {
          role: "user",
          content: "Follow up question",
        },
      ],
    }

    const result = stripThinkingSignatures(payload)

    const assistantMsg = result.messages[1]
    expect(assistantMsg.role).toBe("assistant")
    if (typeof assistantMsg.content !== "string") {
      const thinkingBlock = assistantMsg.content[0] as AnthropicThinkingBlock
      expect(thinkingBlock.type).toBe("thinking")
      expect(thinkingBlock.thinking).toBe("Let me think about this...")
      expect(thinkingBlock.signature).toBe("")
    }
  })

  test("should not modify user messages", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Hello world",
        },
      ],
    }

    const result = stripThinkingSignatures(payload)
    expect(result.messages[0].content).toBe("Hello world")
  })

  test("should not modify assistant messages with string content", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Hello",
        },
        {
          role: "assistant",
          content: "Simple string response",
        },
      ],
    }

    const result = stripThinkingSignatures(payload)
    expect(result.messages[1].content).toBe("Simple string response")
  })

  test("should preserve text blocks in assistant messages", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Hello",
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Here is my response",
            },
          ],
        },
      ],
    }

    const result = stripThinkingSignatures(payload)
    const assistantMsg = result.messages[1]
    if (typeof assistantMsg.content !== "string") {
      expect(assistantMsg.content[0]).toEqual({
        type: "text",
        text: "Here is my response",
      })
    }
  })

  test("should handle multiple thinking blocks across messages", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Hello",
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "First thought",
              signature: "sig1",
            },
            {
              type: "text",
              text: "Response part 1",
            },
          ],
        },
        {
          role: "user",
          content: "Continue",
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Second thought",
              signature: "sig2",
            },
            {
              type: "text",
              text: "Response part 2",
            },
          ],
        },
      ],
    }

    const result = stripThinkingSignatures(payload)

    // Check first assistant message
    const firstAssistant = result.messages[1]
    if (typeof firstAssistant.content !== "string") {
      const block = firstAssistant.content[0] as AnthropicThinkingBlock
      expect(block.signature).toBe("")
      expect(block.thinking).toBe("First thought")
    }

    // Check second assistant message
    const secondAssistant = result.messages[3]
    if (typeof secondAssistant.content !== "string") {
      const block = secondAssistant.content[0] as AnthropicThinkingBlock
      expect(block.signature).toBe("")
      expect(block.thinking).toBe("Second thought")
    }
  })

  test("should preserve other payload properties", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      temperature: 0.7,
      thinking: {
        type: "enabled",
        budget_tokens: 5000,
      },
      messages: [
        {
          role: "user",
          content: "Hello",
        },
      ],
    }

    const result = stripThinkingSignatures(payload)
    expect(result.model).toBe("claude-sonnet-4-5-20250929")
    expect(result.max_tokens).toBe(2048)
    expect(result.temperature).toBe(0.7)
    expect(result.thinking).toEqual({
      type: "enabled",
      budget_tokens: 5000,
    })
  })
})
