import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MODEL = 'gemini-3.8-flash'
const MAX_BODY_CHARS = 12_000
const MAX_MESSAGE_CHARS = 1_500
const MAX_HISTORY_ITEMS = 8
const MAX_HISTORY_TEXT_CHARS = 1_000

type JsonRecord = Record<string, unknown>
type ChatMessage = {
  role: 'user' | 'model'
  parts: { text: string }[]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value: unknown, limit = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

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
  ]

  return fields
    .map(([key, label]) => {
      const fieldValue = safeText(value[key])
      return fieldValue ? `${label}: ${fieldValue}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function buildSystemPrompt(farmContext: string): string {
  const context = farmContext
    ? `Farm details supplied by the user:\n${farmContext}`
    : 'The user has not supplied farm details.'

  return [
    'You are GrowWise, a cautious crop-planning helper for small-scale farmers.',
    'Use plain, friendly language and keep answers short.',
    'You are not a certified agronomist. Never promise yields, income, or guaranteed outcomes.',
    'Do not invent live weather, local conditions, or official recommendations.',
    'Do not give exact fertilizer or pesticide rates. Ask the user to confirm amounts and timing with a local agricultural extension officer.',
    'When information is missing, say what is unknown and what the farmer can check locally.',
    context,
  ].join('\n\n')
}

export async function POST(request: NextRequest) {
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

  const message = safeText(body.message, MAX_MESSAGE_CHARS)

  if (!message) {
    return NextResponse.json(
      { error: 'Enter a question first.' },
      { status: 400 }
    )
  }

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart the app.',
      },
      { status: 503 }
    )
  }

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

  try {
    const ai = new GoogleGenAI({ apiKey })

    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: buildSystemPrompt(
          getFarmContext(body.farmContext)
        ),
        maxOutputTokens: 450,
        temperature: 0.4,
      },
    })

    const reply = result.text?.trim()

    if (!reply) {
      return NextResponse.json(
        { error: 'Gemini returned an empty reply. Please try again.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ reply })
  } catch (error) {
    // Log the error type only. Do not log the API key or user message.
    console.error(
      '[api/chat] Gemini request failed:',
      error instanceof Error ? error.name : 'unknown'
    )

    return NextResponse.json(
      {
        error:
          'Gemini could not answer. Check the API key, model access, and usage limit.',
      },
      { status: 502 }
    )
  }
}