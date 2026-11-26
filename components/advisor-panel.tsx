'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowUp, Camera, Check, CircleHelp, Headphones, Leaf, Mic, Minimize2, Sprout, X, Loader2, AlertTriangle } from 'lucide-react'
import type { Crop, FarmProfile } from '@/lib/growwise'
import { TranslateTree, translateText, useLocale } from '@/lib/i18n'

// ── Types ──────────────────────────────────────────────────────────────────────

type Message = { id: string; role: 'user' | 'assistant'; text: string }

type FarmContextPayload = {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const suggested = ['Why was this crop suggested?', 'What information is missing?', 'What should I verify locally?']
const regionToken = '\uE000region\uE001'

// ── Component ─────────────────────────────────────────────────────────────────

export function AdvisorPanel({ profile, crop, onClose }: { profile: FarmProfile; crop: Crop | null; onClose: () => void }) {
  const language = useLocale()
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [attachment, setAttachment] = useState('')
  const [featureNotice, setFeatureNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Build the farm context payload to send server-side (never keys, just farm data)
  function buildFarmContext(): FarmContextPayload {
    return {
      region: profile.location || undefined,
      season: profile.season || undefined,
      water: profile.water || undefined,
      soilMode: profile.soilMode || undefined,
      texture: profile.soilMode === 'visual' ? profile.texture : undefined,
      soilColor: profile.soilMode === 'visual' ? profile.soilColor : undefined,
      moisture: profile.soilMode === 'visual' ? profile.moisture : undefined,
      nitrogen: profile.soilMode === 'report' ? profile.nitrogen : undefined,
      phosphorus: profile.soilMode === 'report' ? profile.phosphorus : undefined,
      potassium: profile.soilMode === 'report' ? profile.potassium : undefined,
      ph: profile.soilMode === 'report' ? profile.ph : undefined,
      budget: profile.budget || undefined,
      fertilizer: profile.fertilizer || undefined,
      crop: crop?.name || undefined,
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    const displayedQuestion = suggested.includes(text) ? translateText(text, language) : text

    // Optimistically add user message — stable id so React key never shifts
    const userMsg: Message = { id: `msg-${Date.now()}-u`, role: 'user', text: displayedQuestion }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setQuestion('')
    setApiError('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages, // send full history for multi-turn context
          farmContext: buildFarmContext(),
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setApiError(data.error ?? 'Something went wrong. Please try again.')
        // Remove the optimistic user message so the user can retry
        setMessages(messages)
      } else {
        const assistantMsg: Message = { id: `msg-${Date.now()}-a`, role: 'assistant', text: data.reply }
        setMessages([...updatedMessages, assistantMsg])
      }
    } catch {
      setApiError('Could not reach the assistant. Check your connection and try again.')
      setMessages(messages)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (question.trim()) sendMessage(question.trim())
  }

  return (
    <TranslateTree>
      <div className="assistant-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <aside className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
          <header className="assistant-header">
            <div className="assistant-brand-icon"><Sprout aria-hidden="true" /></div>
            <div>
              <h2 id="assistant-title">Field notes</h2>
              <p>GrowWise AI assistant <span className="online-dot" /></p>
            </div>
            <button className="assistant-minimize" onClick={onClose} aria-label="Close assistant"><Minimize2 aria-hidden="true" /></button>
            <button className="assistant-close-mobile" onClick={onClose} aria-label="Close assistant"><X aria-hidden="true" /></button>
          </header>

          <div className="assistant-context">
            <span><Leaf aria-hidden="true" /> Your farm context</span>
            <p>
              {profile.location ? <span data-no-translate="true">{profile.location}</span> : 'Region not set'}
              {' · '}
              {['Long rains', 'Short rains', 'Winter', 'Summer'].includes(profile.season) ? profile.season : <span data-no-translate="true">{profile.season}</span>}
              {' · '}{profile.water}
              {crop ? ` · ${crop.name}` : ''}
            </p>
          </div>

          <div className="assistant-messages" aria-live="polite">
            {/* Intro message */}
            <div className="assistant-intro">
              <div className="bot-avatar"><Sprout aria-hidden="true" /></div>
              <p>
                Hi {profile.name ? <span data-no-translate="true">{profile.name}</span> : 'there'}! I can help you think through your crop choices and what to check locally. I&apos;m a decision-support tool, not a certified agronomist — always verify important decisions with a local expert.
              </p>
            </div>

            {/* Suggested prompts (shown until first message) */}
            {!messages.length && !loading && (
              <div className="suggested-questions">
                <span>TRY ASKING</span>
                {suggested.map((item) => (
                  <button key={item} onClick={() => sendMessage(item)}>
                    {item}<ArrowUp aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            {/* Conversation messages */}
            {messages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                {message.role === 'assistant' && <div className="bot-avatar small"><Sprout aria-hidden="true" /></div>}
                <p>
                  {message.role === 'user'
                    ? <span data-no-translate="true">{message.text}</span>
                    : message.text.split(regionToken).map((part, partIndex, parts) => (
                        <Fragment key={`${message.id}-${partIndex}`}>
                          {part}
                          {partIndex < parts.length - 1 && <span data-no-translate="true">{profile.location}</span>}
                        </Fragment>
                      ))}
                </p>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="chat-message assistant">
                <div className="bot-avatar small"><Sprout aria-hidden="true" /></div>
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.4em', opacity: 0.7 }}>
                  <Loader2 aria-hidden="true" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} size={16} />
                  Thinking…
                </p>
              </div>
            )}

            {/* API error state */}
            {apiError && (
              <div className="feature-notice" role="alert" style={{ background: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.2)' }}>
                <AlertTriangle aria-hidden="true" size={16} />
                <span>{apiError}</span>
              </div>
            )}

            {/* Photo attachment notice */}
            {attachment && (
              <div className="upload-note">
                <Camera aria-hidden="true" />
                <span>
                  <span data-no-translate="true">{attachment}</span>
                  <small>Photo review is not available in this prototype.</small>
                </span>
                <button onClick={() => setAttachment('')} aria-label="Remove photo"><X aria-hidden="true" /></button>
              </div>
            )}

            {featureNotice && (
              <div className="feature-notice"><CircleHelp aria-hidden="true" /><span>{featureNotice}</span></div>
            )}

            <div className="assistant-disclaimer">
              <CircleHelp aria-hidden="true" /> AI suggestions are for guidance only. Consult a local agricultural expert before important decisions.
            </div>

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          <div className="assistant-composer">
            <div className="composer-tools">
              <label className="tool-button" title="Attach a photo">
                <Camera aria-hidden="true" /><span>Photo</span>
                <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) setAttachment(file.name) }} />
              </label>
              <button className="tool-button" onClick={() => setFeatureNotice('Microphone is a visual demo only. Speech recognition is not enabled.')}>
                <Mic aria-hidden="true" /><span>Voice demo</span>
              </button>
              <button className="tool-button listen-demo" onClick={() => setFeatureNotice('Listen is a visual demo only. Text-to-speech is not enabled.')}>
                <Headphones aria-hidden="true" /><span>Listen demo</span>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="assistant-input">Ask a question</label>
              <input
                id="assistant-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about your farm…"
                disabled={loading}
              />
              <button type="submit" aria-label="Send message" disabled={!question.trim() || loading}>
                {loading ? <Loader2 aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} size={18} /> : <ArrowUp aria-hidden="true" />}
              </button>
            </form>
            <div className="composer-note"><Check aria-hidden="true" /> Your farm details stay in this session</div>
          </div>
        </aside>
      </div>
    </TranslateTree>
  )
}
