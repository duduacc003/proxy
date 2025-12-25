export interface ConversationState {
  conversationId: string
  callCount: number
  maxCalls: number
  hasBeenUsed: boolean
  createdAt: number
  expiresAt: number
}

export interface ConversationStats {
  modelId: string
  conversationId: string
  callCount: number
  maxCalls: number
  remainingCalls: number
  hasBeenUsed: boolean
  createdAt: string
  expiresAt: string
  isExpired: boolean
}
