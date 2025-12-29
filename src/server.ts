import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { adminRoutes } from "./routes/admin/route"
import { completionRoutes } from "./routes/chat-completions/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { responsesRoutes } from "./routes/responses/route"
import { tokenRoute } from "./routes/token/route"
import { usageRoute } from "./routes/usage/route"

export const server = new Hono()

server.use(logger())
server.use(cors())

server.use(async (c, next) => {
  const apiKey = process.env.API_KEY
  if (!apiKey) {
    await next()
    return
  }

  // Check x-api-key header first
  let provided = c.req.header("x-api-key")

  // If not found, check Authorization: Bearer header (for Codex compatibility)
  if (!provided) {
    const authHeader = c.req.header("Authorization")
    if (authHeader?.startsWith("Bearer ")) {
      provided = authHeader.slice(7)
    }
  }

  if (!provided || provided !== apiKey) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  await next()
})

server.get("/", (c) => c.text("Server running"))

server.route("/chat/completions", completionRoutes)
server.route("/models", modelRoutes)
server.route("/embeddings", embeddingRoutes)
server.route("/usage", usageRoute)
server.route("/token", tokenRoute)
server.route("/responses", responsesRoutes)
server.route("/admin", adminRoutes)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)
server.route("/v1/responses", responsesRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)
