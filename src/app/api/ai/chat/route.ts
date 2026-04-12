import Anthropic from '@anthropic-ai/sdk'
import { getServerSession } from '@/lib/session'
import { buildSystemPrompt } from '@/lib/ai/systemPrompt'
import { AI_TOOLS } from '@/lib/ai/tools'
import { handleReadTool } from '@/lib/ai/toolHandlers'
import { handleWriteTool } from '@/lib/ai/writeHandlers'
import { checkInjectionPatterns } from '@/lib/ai/injectionGuard'
import { db } from '@/db'
import { aiConversationLogs } from '@/db/schema/ai'

// Tools that stage through pending_ai_actions — all others are read-only
const WRITE_TOOLS = new Set([
  'record_sale',
  'record_expense',
  'record_payment_received',
  'add_customer',
  'add_supplier',
  'update_customer',
  'adjust_stock',
])

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // server-side only — never exposed
})

export async function POST(req: Request) {
  // ── 1. Session & business context ─────────────────────────────────────────
  let session: Awaited<ReturnType<typeof getServerSession>>
  try {
    session = await getServerSession()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = session.user.businessId // always from session
  const userId = session.user.id
  const userRole = session.user.role

  // ── 2. Parse request ──────────────────────────────────────────────────────
  let body: { messages?: Anthropic.MessageParam[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { messages } = body

  if (!messages?.length) {
    return Response.json({ error: 'No messages provided' }, { status: 400 })
  }

  const latestUserMessage = messages.at(-1)
  if (latestUserMessage?.role !== 'user') {
    return Response.json({ error: 'Last message must be from user' }, { status: 400 })
  }

  const latestText =
    typeof latestUserMessage.content === 'string'
      ? latestUserMessage.content
      : Array.isArray(latestUserMessage.content)
        ? latestUserMessage.content
            .filter((b): b is Anthropic.TextBlockParam => b.type === 'text')
            .map((b) => b.text)
            .join(' ')
        : ''

  // ── 3. Injection detection ────────────────────────────────────────────────
  const injectionCheck = checkInjectionPatterns(latestText)
  const requiresReview = injectionCheck.suspicious

  // ── 4. Build system prompt with live business context ─────────────────────
  const systemPrompt = await buildSystemPrompt(businessId, userRole)

  // ── 5. Call Anthropic API with agentic loop ───────────────────────────────
  const toolCallsMade: Array<{ name: string; input: unknown }> = []
  let finalTextResponse = ''

  try {
    let currentResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: AI_TOOLS,
      messages,
    })

    // Accumulate the full conversation so each re-call has correct history
    let accumulatedMessages: Anthropic.MessageParam[] = [...messages]

    while (currentResponse.stop_reason === 'tool_use') {
      const toolUseBlocks = currentResponse.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )

      const resultContents: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        toolCallsMade.push({ name: toolUse.name, input: toolUse.input })

        let toolResult: string
        try {
          if (WRITE_TOOLS.has(toolUse.name)) {
            toolResult = await handleWriteTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              businessId, // injected from session — never from tool input
              userId,
            )
          } else {
            toolResult = await handleReadTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              businessId, // injected from session — never from tool input
            )
          }
        } catch (err) {
          toolResult = JSON.stringify({
            error: err instanceof Error ? err.message : 'Tool execution failed',
          })
        }

        resultContents.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResult,
        })
      }

      // Append assistant turn + tool results to the conversation
      accumulatedMessages = [
        ...accumulatedMessages,
        { role: 'assistant', content: currentResponse.content },
        { role: 'user', content: resultContents },
      ]

      currentResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools: AI_TOOLS,
        messages: accumulatedMessages,
      })
    }

    finalTextResponse = currentResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI request failed'
    return Response.json({ error: message }, { status: 502 })
  }

  // ── 6. Log the exchange ───────────────────────────────────────────────────
  await db.insert(aiConversationLogs).values({
    businessId,
    userId,
    sessionId: undefined,
    userMessage: latestText,
    aiResponse: finalTextResponse,
    toolCalls: toolCallsMade,
    actionsTaken: [],
    requiresReview,
  })

  // ── 7. Return response ────────────────────────────────────────────────────
  return Response.json({
    response: finalTextResponse,
    toolCalls: toolCallsMade,
    requiresReview,
  })
}
