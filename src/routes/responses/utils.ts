import type {
  ResponseInputItem,
  ResponsesPayload,
} from "~/services/copilot/create-responses"

import { getInitiatorForKey } from "~/lib/initiator"

export const getResponsesRequestOptions = (
  payload: ResponsesPayload,
): { vision: boolean; initiator: "agent" | "user" } => {
  const vision = hasVisionInput(payload)
  const initiatorKey = getInitiatorKey(payload)
  const lastRole = getLastMessageRole(payload)
  const initiator = getInitiatorForKey(initiatorKey, lastRole === "user")

  return { vision, initiator }
}

const getInitiatorKey = (payload: ResponsesPayload): string => {
  const userId = payload.metadata?.["user_id"]
  if (userId && userId.trim()) {
    return userId.trim()
  }

  if (payload.safety_identifier?.trim()) {
    return payload.safety_identifier.trim()
  }

  if (payload.prompt_cache_key?.trim()) {
    return payload.prompt_cache_key.trim()
  }

  return "default"
}

const getLastMessageRole = (payload: ResponsesPayload): string | undefined => {
  const items = getPayloadItems(payload)
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (!("role" in item)) {
      continue
    }
    const role = (item as { role?: string }).role
    if (role) {
      return role
    }
  }
  return undefined
}

export const hasVisionInput = (payload: ResponsesPayload): boolean => {
  const values = getPayloadItems(payload)
  return values.some((item) => containsVisionContent(item))
}

const getPayloadItems = (
  payload: ResponsesPayload,
): Array<ResponseInputItem> => {
  const result: Array<ResponseInputItem> = []

  const { input } = payload

  if (Array.isArray(input)) {
    result.push(...input)
  }

  return result
}

const containsVisionContent = (value: unknown): boolean => {
  if (!value) return false

  if (Array.isArray(value)) {
    return value.some((entry) => containsVisionContent(entry))
  }

  if (typeof value !== "object") {
    return false
  }

  const record = value as Record<string, unknown>
  const type =
    typeof record.type === "string" ? record.type.toLowerCase() : undefined

  if (type === "input_image") {
    return true
  }

  if (Array.isArray(record.content)) {
    return record.content.some((entry) => containsVisionContent(entry))
  }

  return false
}
