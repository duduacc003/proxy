import type { ModelsResponse } from "~/services/copilot/get-models"

export interface State {
  githubToken?: string
  copilotToken?: string

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

export const state: State = {
  accountType: "individual",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
  verbose: false,
  initiatorWindows: new Map(),
  initiatorWindowMin: 70,
  initiatorWindowMax: 100,
}
