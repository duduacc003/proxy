import consola from "consola"
import { randomUUID } from "node:crypto"

import { state } from "~/lib/state"

import type { ConversationState, ConversationStats } from "./types"

class ConversationManager {
  private conversations: Map<string, ConversationState> = new Map()
  private locks: Map<string, Promise<void>> = new Map()

  reset(): void {
    this.conversations.clear()
    this.locks.clear()
  }

  getInitiator(modelId: string): "user" | "agent" {
    const conversation = this.getOrCreateConversation(modelId)

    if (this.shouldResetConversation(modelId)) {
      return "user"
    }

    return conversation.hasBeenUsed ? "agent" : "user"
  }

  getConversationId(modelId: string): string {
    const conversation = this.getOrCreateConversation(modelId)
    return conversation.conversationId
  }

  async markAsUsed(modelId: string): Promise<void> {
    let lockPromise = this.locks.get(modelId)

    if (!lockPromise) {
      let resolveLock: (() => void) | undefined
      lockPromise = new Promise<void>((resolve) => {
        resolveLock = resolve
      })
      this.locks.set(modelId, lockPromise)

      try {
        this.doMarkAsUsed(modelId)
      } finally {
        if (resolveLock) resolveLock()
        this.locks.delete(modelId)
      }
    } else {
      await lockPromise
    }
  }

  private doMarkAsUsed(modelId: string): void {
    const conversation = this.conversations.get(modelId)
    if (!conversation) return

    if (this.shouldResetConversation(modelId)) {
      this.resetConversation(modelId)
      const newConversation = this.conversations.get(modelId)
      if (newConversation) {
        newConversation.hasBeenUsed = true
        newConversation.callCount = 1
      }
    } else {
      conversation.hasBeenUsed = true
      conversation.callCount++
    }
  }

  getStats(): Array<ConversationStats> {
    const now = Date.now()
    const stats: Array<ConversationStats> = []

    this.cleanupExpired()

    for (const [modelId, conv] of this.conversations) {
      stats.push({
        modelId,
        conversationId: conv.conversationId,
        callCount: conv.callCount,
        maxCalls: conv.maxCalls,
        remainingCalls: Math.max(0, conv.maxCalls - conv.callCount),
        hasBeenUsed: conv.hasBeenUsed,
        createdAt: new Date(conv.createdAt).toISOString(),
        expiresAt: new Date(conv.expiresAt).toISOString(),
        isExpired: now >= conv.expiresAt,
      })
    }

    return stats
  }

  private cleanupExpired(): void {
    const now = Date.now()
    for (const [modelId, conv] of this.conversations) {
      if (now >= conv.expiresAt || conv.callCount >= conv.maxCalls) {
        this.conversations.delete(modelId)
      }
    }
  }

  private getOrCreateConversation(modelId: string): ConversationState {
    let conversation = this.conversations.get(modelId)

    if (!conversation || this.shouldResetConversation(modelId)) {
      conversation = this.createConversation(modelId)
      this.conversations.set(modelId, conversation)
    }

    return conversation
  }

  private createConversation(modelId: string): ConversationState {
    const minCalls = state.initiatorWindowMin
    const maxCalls = state.initiatorWindowMax
    const range = maxCalls - minCalls + 1
    const randomMaxCalls = Math.floor(Math.random() * range) + minCalls

    const hoursUntilExpiration = Math.random() * 4 + 20
    const expiresAt = Date.now() + hoursUntilExpiration * 60 * 60 * 1000

    consola.debug(
      `Created conversation for ${modelId}: maxCalls=${randomMaxCalls}, expiresIn=${hoursUntilExpiration.toFixed(1)}h`,
    )

    return {
      conversationId: randomUUID(),
      callCount: 0,
      maxCalls: randomMaxCalls,
      hasBeenUsed: false,
      createdAt: Date.now(),
      expiresAt,
    }
  }

  private shouldResetConversation(modelId: string): boolean {
    const conversation = this.conversations.get(modelId)
    if (!conversation) return false

    const now = Date.now()
    const maxCallsReached = conversation.callCount >= conversation.maxCalls
    const expired = now >= conversation.expiresAt

    return maxCallsReached || expired
  }

  private resetConversation(modelId: string): void {
    const newConversation = this.createConversation(modelId)
    this.conversations.set(modelId, newConversation)
    consola.info(`Reset conversation for model ${modelId}`)
  }
}

export const conversationManager = new ConversationManager()
