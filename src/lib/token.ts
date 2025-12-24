import consola from "consola"
import fs from "node:fs/promises"

import { PATHS } from "~/lib/paths"
import { getCopilotToken } from "~/services/github/get-copilot-token"
import { getDeviceCode } from "~/services/github/get-device-code"
import { getGitHubUser } from "~/services/github/get-user"
import { pollAccessToken } from "~/services/github/poll-access-token"

import { HTTPError } from "./error"
import { state } from "./state"

const readGithubToken = () => fs.readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")

const writeGithubToken = (token: string) =>
  fs.writeFile(PATHS.GITHUB_TOKEN_PATH, token)

let copilotRefreshTimer: ReturnType<typeof setTimeout> | undefined

const REFRESH_RETRY_MS = 60_000
const TOKEN_MARGIN_MS = 60_000

async function refreshCopilotToken(): Promise<void> {
  try {
    const { token, refresh_in, expires_at } = await getCopilotToken()
    state.copilotToken = token
    state.copilotTokenExpiresAt = expires_at * 1000

    consola.debug("Copilot token refreshed")
    if (state.showToken) {
      consola.info("Copilot token:", token)
    }

    scheduleNextRefresh(refresh_in)
  } catch (error) {
    consola.error("Failed to refresh Copilot token, retrying in 60s:", error)
    scheduleNextRefresh(REFRESH_RETRY_MS / 1000)
  }
}

function scheduleNextRefresh(refreshInSeconds: number): void {
  if (copilotRefreshTimer) {
    clearTimeout(copilotRefreshTimer)
  }

  const delay = Math.max(refreshInSeconds - 60, 60) * 1000
  copilotRefreshTimer = setTimeout(() => {
    void refreshCopilotToken()
  }, delay)
}

export async function getValidCopilotToken(): Promise<string> {
  const now = Date.now()
  const expiresAt = state.copilotTokenExpiresAt ?? 0

  if (state.copilotToken && expiresAt > now + TOKEN_MARGIN_MS) {
    return state.copilotToken
  }

  consola.debug("Copilot token expired or missing, refreshing on-demand")
  await refreshCopilotToken()

  if (!state.copilotToken) {
    throw new Error("Failed to obtain Copilot token")
  }

  return state.copilotToken
}

function buildGitHubTokenWebhookHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }

  const basicUser = process.env.GITHUB_TOKEN_WEBHOOK_BASIC_USER
  const basicPass = process.env.GITHUB_TOKEN_WEBHOOK_BASIC_PASS
  if ((basicUser && !basicPass) || (!basicUser && basicPass)) {
    throw new Error(
      "Both GITHUB_TOKEN_WEBHOOK_BASIC_USER and GITHUB_TOKEN_WEBHOOK_BASIC_PASS must be set",
    )
  }
  if (basicUser && basicPass) {
    headers.Authorization = `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString("base64")}`
  }

  const bearer = process.env.GITHUB_TOKEN_WEBHOOK_BEARER
  if (bearer?.trim()) {
    headers["X-Webhook-Bearer"] = bearer.trim()
  }

  const keyword = process.env.GITHUB_TOKEN_WEBHOOK_KEYWORD
  if (keyword?.trim()) {
    headers.keyword = keyword.trim()
  }

  return headers
}

function extractTokenFromWebhookResponse(body: unknown): string {
  if (Array.isArray(body)) {
    const first = body[0] as unknown
    const token = (first as { token?: unknown }).token
    return typeof token === "string" ? token.trim() : ""
  }

  const token = (body as { token?: unknown }).token
  return typeof token === "string" ? token.trim() : ""
}

export async function loadGitHubTokenFromWebhook(): Promise<string> {
  const webhookUrl = process.env.GITHUB_TOKEN_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error("GITHUB_TOKEN_WEBHOOK_URL is not set")
  }

  const headers = buildGitHubTokenWebhookHeaders()

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: "{}",
  })
  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub token from webhook (status ${response.status})`,
    )
  }

  const body = await response.json()
  const token = extractTokenFromWebhookResponse(body)
  if (!token) {
    throw new Error("Webhook response missing token")
  }

  return token
}

export const setupCopilotToken = async () => {
  const { token, refresh_in, expires_at } = await getCopilotToken()
  state.copilotToken = token
  state.copilotTokenExpiresAt = expires_at * 1000

  consola.debug("GitHub Copilot Token fetched successfully!")
  if (state.showToken) {
    consola.info("Copilot token:", token)
  }

  scheduleNextRefresh(refresh_in)
}

interface SetupGitHubTokenOptions {
  force?: boolean
}

export async function setupGitHubToken(
  options?: SetupGitHubTokenOptions,
): Promise<void> {
  try {
    if (process.env.GITHUB_TOKEN_WEBHOOK_URL) {
      const githubToken = await loadGitHubTokenFromWebhook()
      state.githubToken = githubToken
      if (state.showToken) {
        consola.info("GitHub token:", githubToken)
      }
      return
    }

    const githubToken = await readGithubToken()

    if (githubToken && !options?.force) {
      state.githubToken = githubToken
      if (state.showToken) {
        consola.info("GitHub token:", githubToken)
      }
      await logUser()

      return
    }

    consola.info("Not logged in, getting new access token")
    const response = await getDeviceCode()
    consola.debug("Device code response:", response)

    consola.info(
      `Please enter the code "${response.user_code}" in ${response.verification_uri}`,
    )

    const token = await pollAccessToken(response)
    await writeGithubToken(token)
    state.githubToken = token

    if (state.showToken) {
      consola.info("GitHub token:", token)
    }
    await logUser()
  } catch (error) {
    if (error instanceof HTTPError) {
      consola.error("Failed to get GitHub token:", await error.response.json())
      throw error
    }

    consola.error("Failed to get GitHub token:", error)
    throw error
  }
}

async function logUser() {
  const user = await getGitHubUser()
  consola.info(`Logged in as ${user.login}`)
}
