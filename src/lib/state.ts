import type { ModelsResponse } from "~/services/copilot/get-models"

export interface State {
  githubToken?: string
  copilotToken?: string
  copilotTokenExpiresAt?: number

  accountType: string
  models?: ModelsResponse
  vsCodeVersion?: string

  manualApprove: boolean
  rateLimitWait: boolean
  showToken: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
  verbose: boolean

  initiatorWindows: Map<string, InitiatorWindow>
  initiatorWindowMin: number
  initiatorWindowMax: number
}

export interface InitiatorWindow {
  remainingAgentCalls: number
}

const parseEnvInt = (key: string, defaultValue: number): number => {
  const value = process.env[key]
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

export const state: State = {
  accountType: "individual",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
  verbose: false,
  initiatorWindows: new Map(),
  initiatorWindowMin: parseEnvInt("INITIATOR_WINDOW_MIN", 70),
  initiatorWindowMax: parseEnvInt("INITIATOR_WINDOW_MAX", 100),
}
