import { state } from "~/lib/state"

export const getInitiatorForKey = (
  key: string,
  lastRoleIsUser: boolean,
): "user" | "agent" => {
  const windowState = state.initiatorWindows.get(key) ?? {
    remainingAgentCalls: 0,
  }

  if (windowState.remainingAgentCalls > 0) {
    windowState.remainingAgentCalls -= 1
    state.initiatorWindows.set(key, windowState)
    return "agent"
  }

  if (lastRoleIsUser) {
    const minCalls = Math.max(0, state.initiatorWindowMin)
    const maxCalls = Math.max(minCalls, state.initiatorWindowMax)
    const range = maxCalls - minCalls + 1
    windowState.remainingAgentCalls =
      Math.floor(Math.random() * range) + minCalls
    state.initiatorWindows.set(key, windowState)
    return "user"
  }

  windowState.remainingAgentCalls = 0
  state.initiatorWindows.set(key, windowState)
  return "agent"
}
