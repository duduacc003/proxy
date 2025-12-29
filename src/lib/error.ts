import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

import consola from "consola"

export class HTTPError extends Error {
  response: Response

  constructor(message: string, response: Response) {
    super(message)
    this.response = response
  }
}

/**
 * Sends a fire-and-forget notification to external webhook when rate limit is hit.
 * Best-effort delivery - notification may be lost on immediate shutdown.
 * The keyword field is a non-sensitive instance identifier configured via environment.
 */
function notifyRateLimitWebhook(
  errorData: Record<string, unknown>,
  status: number,
): void {
  const webhookUrl = process.env.RATE_LIMIT_WEBHOOK_URL
  if (!webhookUrl) {
    consola.debug("RATE_LIMIT_WEBHOOK_URL not set, skipping notification")
    return
  }

  // Validate URL format
  try {
    new URL(webhookUrl)
  } catch {
    consola.warn("Invalid RATE_LIMIT_WEBHOOK_URL format")
    return
  }

  consola.debug(`Sending rate limit notification to ${webhookUrl}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      event: "rate_limit",
      status,
      keyword: process.env.GITHUB_TOKEN_WEBHOOK_KEYWORD ?? "unknown",
      error: errorData,
      timestamp: new Date().toISOString(),
    }),
  })
    .then((response) => {
      if (!response.ok) {
        consola.warn(
          `Rate limit webhook responded with status ${response.status}`,
        )
      } else {
        consola.info("Rate limit webhook notification sent successfully")
      }
    })
    .catch((err: unknown) => {
      consola.warn("Failed to notify rate limit webhook:", err)
    })
    .finally(() => {
      clearTimeout(timeoutId)
    })
}

export async function forwardError(c: Context, error: unknown) {
  consola.error("Error occurred:", error)

  if (error instanceof HTTPError) {
    const errorText = await error.response.text()
    let errorJson: Record<string, unknown> = { raw: errorText }
    try {
      const parsed: unknown = JSON.parse(errorText)
      if (
        typeof parsed === "object"
        && parsed !== null
        && !Array.isArray(parsed)
      ) {
        errorJson = parsed as Record<string, unknown>
      }
    } catch {
      // errorJson already defaults to { raw: errorText }
    }
    consola.error("HTTP error:", errorJson)

    if (error.response.status === 429) {
      consola.info("429 error detected, triggering webhook notification")
      notifyRateLimitWebhook(errorJson, 429)
    }

    return c.json(
      {
        error: {
          message: errorText,
          type: "error",
        },
      },
      error.response.status as ContentfulStatusCode,
    )
  }

  return c.json(
    {
      error: {
        message: (error as Error).message,
        type: "error",
      },
    },
    500,
  )
}
