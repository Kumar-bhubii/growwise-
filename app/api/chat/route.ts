/**
 * /api/chat  —  GrowWise Gemini chat route
 *
 * Model selection:
 *   Set GEMINI_MODEL in .env.local to override the default.
 *   Default: gemini-2.0-flash
 *   Example: GEMINI_MODEL=gemini-2.0-flash
 *
 * Retry strategy:
 *   The @google/genai SDK v3.x does NOT perform automatic retries for 503s,
 *   so we add a small manual retry loop limited to TRANSIENT errors (503 / 429).
 *   Auth errors (401 / 403) are never retried.
 *   Maximum: MAX_RETRIES attempts, with exponential back-off (1 s → 2 s → 4 s).
 *
 * Security:
 *   GEMINI_API_KEY is read once on the server. It is never logged, echoed,
 *   or included in any response body or error message sent to the client.
 */

import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ── Config ────────────────────────────────────────────────────────────────────

/** Default model — override with GEMINI_MODEL env var, server-side only. */
const DEFAULT_MODEL = 'gemini-1.5-flash'
const MODEL = (process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL

const MAX_BODY_CHARS = 12_000
const MAX_MESSAGE_CHARS = 1_500
const MAX_HISTORY_ITEMS = 8
const MAX_HISTORY_TEXT_CHARS = 1_000

/** How many times to retry a transient (503 / 429) failure. */
const MAX_RETRIES = 1
/** Initial back-off delay in ms; doubles on each retry. */
const INITIAL_BACKOFF_MS = 500

// ── Types ─────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>
type ChatMessage = {
  role: 'user' | 'model'
  parts: { text: string }[]
}

/** Structured error categories we distinguish. */
type GeminiErrorKind =
  | 'transient'   // 503 UNAVAILABLE — retry
  | 'quota'       // 429 RESOURCE_EXHAUSTED — quota / rate-limit
  | 'auth'        // 401 / 403 — bad key
  | 'unknown'     // anything else

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value: unknown, limit = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Classify a thrown SDK error without touching the API key or leaking details.
 * The @google/genai SDK surfaces HTTP status on the error object as `status`
 * (a number or string) and sometimes in `message`.
 */
function classifyError(error: unknown): GeminiErrorKind {
  if (!isRecord(error)) return 'unknown'

  // Numeric HTTP status attached by the SDK
  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof error.status === 'string'
      ? parseInt(error.status, 10)
      : NaN

  if (!isNaN(status)) {
    if (status === 503) return 'transient'
    if (status === 429) return 'quota'
    if (status === 401 || status === 403) return 'auth'
    return 'unknown'
  }

  // Fall back to scanning the message string (never logged to client)
  const msg =
    typeof error.message === 'string' ? error.message.toLowerCase() : ''

  if (msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand')) {
    return 'transient'
  }
  if (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('limit')
  ) {
    return 'quota'
  }
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('api_key') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission')
  ) {
    return 'auth'
  }

  return 'unknown'
}

/** User-facing messages — none include the key, model internals, or stack. */
function userMessage(kind: GeminiErrorKind, retriesExhausted = false): string {
  switch (kind) {
    case 'transient':
      return retriesExhausted
        ? 'The assistant is busy right now. Please try again in a moment — Gemini is experiencing high demand.'
        : 'The assistant is temporarily unavailable. Please try again shortly.'
    case 'quota':
      return 'The assistant has reached its usage limit for now. Please wait a few minutes and try again.'
    case 'auth':
      return 'The Gemini API key is not valid or does not have access to this model. Check GEMINI_API_KEY in .env.local.'
    default:
      return 'The assistant could not respond right now. Please try again in a moment.'
  }
}

// ── Farm context ──────────────────────────────────────────────────────────────

function getFarmContext(value: unknown): string {
  if (!isRecord(value)) return ''

  const fields: Array<[string, string]> = [
    ['region', 'Region'],
    ['season', 'Season'],
    ['water', 'Water access'],
    ['soilMode', 'Soil input type'],
    ['texture', 'Soil texture'],
    ['soilColor', 'Soil color'],
    ['moisture', 'Soil moisture'],
    ['nitrogen', 'Nitrogen from report'],
    ['phosphorus', 'Phosphorus from report'],
    ['potassium', 'Potassium from report'],
    ['ph', 'Soil pH from report'],
    ['budget', 'Budget preference'],
    ['fertilizer', 'Fertilizer access'],
    ['crop', 'Crop being discussed'],
    ['cropSummary', 'Crop recommendation summary'],
    ['cropWhy', 'Reason for crop recommendation'],
    ['cropFactors', 'Factors used in crop recommendation'],
  ]

  return fields
    .map(([key, label]) => {
      const fieldValue = safeText(value[key])
      return fieldValue ? `${label}: ${fieldValue}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(farmContext: string): string {
  const context = farmContext
    ? `Farm and crop details supplied by the app:\n${farmContext}`
    : 'The app has not supplied farm or crop details.'

  return [
    'You are GrowWise, a helpful crop-planning assistant.',
    "Answer the user's exact question first. Never reply with only a disclaimer.",
    'When asked why a crop was suggested, explain the supplied recommendation reason and factors in 2–4 short, plain-language sentences.',
    'Use only information supplied in the farm and crop details. If the recommendation reason or factors are missing, say that the app did not provide enough information to explain the recommendation.',
    'Do not invent weather, local conditions, crop scores, or recommendation reasons.',
    'Do not promise yields or income, and do not give exact fertilizer or pesticide rates.',
    'Add a brief local-verification reminder only when useful. Do not let a reminder replace the answer.',
    context,
  ].join('\n\n')
}

// ── Core call with retry ──────────────────────────────────────────────────────

/**
 * Calls Gemini, retrying up to MAX_RETRIES times on transient / quota errors.
 * Throws the last error if all attempts fail.
 */
async function callGeminiWithRetry(
  ai: GoogleGenAI,
  contents: ChatMessage[],
  systemInstruction: string
): Promise<string> {
  let lastError: unknown
  let backoff = INITIAL_BACKOFF_MS

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: 300,
          temperature: 0.4,
        },
      })

      const reply = result.text?.trim()
      if (!reply) throw new Error('empty_reply')
      return reply
    } catch (err) {
      lastError = err

      const kind = classifyError(err)

      // Never retry auth errors — they won't fix themselves with time
      if (kind === 'auth') throw err

      // On the last allowed attempt, give up
      if (attempt === MAX_RETRIES) throw err

      // Log the retry attempt (safe — no key, no message content)
      console.warn(
        `[api/chat] Gemini ${kind} error on attempt ${attempt + 1}/${MAX_RETRIES + 1}. ` +
        `Retrying in ${backoff}ms…`
      )

      await sleep(backoff)
      backoff *= 2  // exponential back-off
    }
  }

  throw lastError
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────

  let body: unknown

  try {
    const rawBody = await request.text()

    if (rawBody.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { error: 'Message is too large.' },
        { status: 413 }
      )
    }

    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 }
    )
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // ── Validate message ────────────────────────────────────────────────────────

  const message = safeText(body.message, MAX_MESSAGE_CHARS)

  if (!message) {
    return NextResponse.json(
      { error: 'Enter a question first.' },
      { status: 400 }
    )
  }

  // ── API key check — never logged or sent to client ──────────────────────────

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart the dev server.',
      },
      { status: 503 }
    )
  }

  // ── Build chat history ──────────────────────────────────────────────────────

  const history: ChatMessage[] = Array.isArray(body.history)
    ? body.history
        .slice(-MAX_HISTORY_ITEMS)
        .flatMap((item): ChatMessage[] => {
          if (
            !isRecord(item) ||
            (item.role !== 'user' && item.role !== 'assistant')
          ) {
            return []
          }

          const text = safeText(item.text, MAX_HISTORY_TEXT_CHARS)
          if (!text) return []

          return [
            {
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text }],
            },
          ]
        })
    : []

  const contents: ChatMessage[] = [
    ...history,
    { role: 'user', parts: [{ text: message }] },
  ]

  // ── Call Gemini (with retry) ─────────────────────────────────────────────────

  try {
    const ai = new GoogleGenAI({ apiKey })
    const systemInstruction = buildSystemPrompt(getFarmContext(body.farmContext))

    const reply = await callGeminiWithRetry(ai, contents, systemInstruction)

    if (reply === 'empty_reply') {
      return NextResponse.json(
        { error: 'Gemini returned an empty reply. Please try again.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ reply })
  } catch (error) {
    const kind = classifyError(error)

    // Log the error kind and HTTP status only — never the key or message body
    const statusCode =
      isRecord(error) && (typeof error.status === 'number' || typeof error.status === 'string')
        ? String(error.status)
        : 'unknown'

    console.error('[api/chat] Gemini request failed after retries:', {
      kind,
      status: statusCode,
      model: MODEL,
      errorName: isRecord(error) ? String(error.name ?? '') : '',
      errorCode: isRecord(error) ? String(error.code ?? '') : '',
    })

    const httpStatus =
      kind === 'auth' ? 401 : kind === 'quota' ? 429 : 502

    return NextResponse.json(
      { error: userMessage(kind, true), retryable: kind === 'transient' || kind === 'quota' || kind === 'unknown' },
      { status: httpStatus }
    )
  }
}
