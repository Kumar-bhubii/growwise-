/**
 * POST /api/chat
 *
 * Server-side route that proxies messages to Gemini.
 * The GEMINI_API_KEY env var is never exposed to the browser.
 *
 * Request body (JSON):
 *   {
 *     message: string          // the user's question
 *     history: Array<{ role: 'user'|'assistant', text: string }>
 *     farmContext?: {          // optional — only sent when available
 *       region?: string
 *       season?: string
 *       water?: string
 *       soilMode?: string
 *       texture?: string
 *       soilColor?: string
 *       moisture?: string
 *       nitrogen?: string
 *       phosphorus?: string
 *       potassium?: string
 *       ph?: string
 *       budget?: string
 *       fertilizer?: string
 *       crop?: string
 *     }
 *   }
 *
 * Response body (JSON):
 *   { reply: string } | { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'

// ── Gemini availability check ─────────────────────────────────────────────────

function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

// ── Farm context → readable text ──────────────────────────────────────────────

type FarmContext = {
  region?: string
  season?: string
  water?: string
  soilMode?: string
  texture?: string
  soilColor?: string
  moisture?: string
  nitrogen?: string
  phosphorus?: string
  potassium?: string
  ph?: string
  budget?: string
  fertilizer?: string
  crop?: string
}

function buildFarmContextText(ctx: FarmContext): string {
  const lines: string[] = []
  if (ctx.region) lines.push(`Region / district: ${ctx.region}`)
  if (ctx.season) lines.push(`Season: ${ctx.season}`)
  if (ctx.water) lines.push(`Water access: ${ctx.water}`)
  if (ctx.soilMode === 'report') {
    const parts = [
      ctx.nitrogen ? `N ${ctx.nitrogen}` : null,
      ctx.phosphorus ? `P ${ctx.phosphorus}` : null,
      ctx.potassium ? `K ${ctx.potassium}` : null,
      ctx.ph ? `pH ${ctx.ph}` : null,
    ].filter(Boolean)
    if (parts.length) lines.push(`Soil (lab report): ${parts.join(', ')}`)
  } else if (ctx.soilMode === 'visual') {
    const parts = [ctx.texture, ctx.soilColor, ctx.moisture].filter(Boolean)
    if (parts.length) lines.push(`Soil (visual estimate): ${parts.join(', ')}`)
  }
  if (ctx.budget) lines.push(`Budget preference: ${ctx.budget}`)
  if (ctx.fertilizer) lines.push(`Fertilizer access: ${ctx.fertilizer}`)
  if (ctx.crop) lines.push(`Crop being discussed: ${ctx.crop}`)
  return lines.join('\n')
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(farmContextText: string): string {
  return `You are GrowWise Field Notes, a friendly and cautious crop-planning assistant for small-scale farmers.

Your role is to help farmers think through their crop choices, understand what factors matter, and know what questions to ask a local expert. You are a decision-support tool, not a certified agronomist.

RULES — follow these strictly:
1. Never promise specific crop yields, income projections, or guaranteed outcomes.
2. Never invent or state specific weather forecasts or current rainfall data as fact.
3. Never give unverified exact farming instructions (e.g. "apply 50 kg/ha of urea") without noting that amounts should be confirmed locally.
4. For important or high-risk decisions, always encourage the farmer to consult a local agricultural extension officer or agronomist.
5. Keep answers practical, plain, and grounded in what the farmer has shared.
6. If you are uncertain, say so clearly rather than guessing.
7. Be respectful of local knowledge — the farmer may know things about their land that you do not.
8. Responses should be concise and easy to understand, ideally suitable for someone reading on a mobile phone.

${farmContextText ? `FARMER'S CURRENT CONTEXT:\n${farmContextText}\n\nUse this context to give more relevant answers, but acknowledge any missing or uncertain information.\n` : 'No farm context is available yet. Provide general guidance and remind the farmer to share their farm details for more relevant answers.\n'}`
}

// ── Demo fallback responses ───────────────────────────────────────────────────

function demoReply(message: string, farmContextText: string): string {
  const lower = message.toLowerCase()
  const hasContext = farmContextText.length > 0

  const contextNote = hasContext
    ? `\n\n*Your farm context was noted but I'm running in demo mode — connect a Gemini API key for real AI responses.*`
    : `\n\n*I'm in demo mode. Connect a Gemini API key for real AI responses.*`

  if (lower.includes('why') || lower.includes('suggest')) {
    return `In demo mode, suggestions are illustrative. They show how factors like season, water access, and soil type can shape crop priorities. To get real AI-powered explanations, please add a Gemini API key to your environment.${contextNote}`
  }
  if (lower.includes('missing') || lower.includes('information')) {
    return `Key information often missing includes: current local weather, a lab-verified soil test, local crop variety guidance, and field-specific drainage. A local extension officer can help fill these gaps.${contextNote}`
  }
  if (lower.includes('verify') || lower.includes('local') || lower.includes('expert')) {
    return `Before acting on any suggestion, it's worth checking with a local agricultural extension officer about: suitable varieties for your area, the best planting window, water and drainage requirements, and post-harvest options.${contextNote}`
  }
  return `This is a demo response — Gemini is not connected yet.\n\nYou asked: *"${message}"*\n\nTo get real AI-powered crop advice, add your GEMINI_API_KEY to the .env.local file and restart the server.${contextNote}`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message: string = (body.message ?? '').trim()
    const history: Array<{ role: string; text: string }> = body.history ?? []
    const farmContext: FarmContext = body.farmContext ?? {}

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    }

    const farmContextText = buildFarmContextText(farmContext)

    // ── Demo mode (no Gemini key) ──────────────────────────────────────────
    if (!isGeminiConfigured()) {
      // Small artificial delay so the loading state is visible
      await new Promise((r) => setTimeout(r, 600))
      return NextResponse.json({ reply: demoReply(message, farmContextText) })
    }

    // ── Live Gemini response ───────────────────────────────────────────────
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

    // Build conversation history for multi-turn context
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      })
    }

    // Add the new user message
    contents.push({ role: 'user', parts: [{ text: message }] })

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: buildSystemPrompt(farmContextText),
        maxOutputTokens: 600,
        temperature: 0.5,
      },
    })

    const reply = response.text ?? ''
    if (!reply) {
      return NextResponse.json({ error: 'The AI returned an empty response. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ reply })
  } catch (err: unknown) {
    console.error('[/api/chat] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Surface quota / auth errors clearly so the developer can act on them
    if (message.includes('API key') || message.includes('quota') || message.includes('429')) {
      return NextResponse.json(
        { error: 'Gemini API error: ' + message + ' Check your GEMINI_API_KEY and quota.' },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: 'Something went wrong with the AI assistant. Please try again.' },
      { status: 500 }
    )
  }
}
