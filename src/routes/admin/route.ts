import { Hono } from "hono"

import { conversationManager } from "~/lib/conversation"
import { forwardError } from "~/lib/error"
import { state } from "~/lib/state"
import { loadGitHubTokenFromWebhook, setupCopilotToken } from "~/lib/token"

export const adminRoutes = new Hono()

adminRoutes.get("/conversations", (c) => {
  const adminToken = process.env.COPILOT_API_ADMIN_TOKEN
  if (!adminToken) {
    return c.json({ ok: false, error: "Server misconfigured" }, 500)
  }

  const providedAdminToken = c.req.header("x-admin-token")
  if (!providedAdminToken || providedAdminToken !== adminToken) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  const stats = conversationManager.getStats()

  return c.json({
    ok: true,
    config: {
      initiatorWindowMin: state.initiatorWindowMin,
      initiatorWindowMax: state.initiatorWindowMax,
    },
    conversations: stats,
  })
})

adminRoutes.get("/reload-token", async (c) => {
  try {
    const adminToken = process.env.COPILOT_API_ADMIN_TOKEN
    if (!adminToken) {
      return c.json({ ok: false, error: "Server misconfigured" }, 500)
    }

    const providedAdminToken = c.req.query("token")?.trim()
    const expectedToken = adminToken.trim()
    console.log(
      `[DEBUG] provided: "${providedAdminToken}" (${providedAdminToken?.length}) | expected: "${expectedToken}" (${expectedToken.length})`,
    )
    if (!providedAdminToken || providedAdminToken !== expectedToken) {
      return c.json({ ok: false, error: "Unauthorized" }, 401)
    }

    if (!process.env.GITHUB_TOKEN_WEBHOOK_URL) {
      return c.json({ ok: false, error: "Webhook not configured" }, 400)
    }

    const githubToken = await loadGitHubTokenFromWebhook()
    state.githubToken = githubToken

    await setupCopilotToken()

    return c.json({ ok: true })
  } catch (error) {
    return await forwardError(c, error)
  }
})
