'use client'

import { useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useLocale, translateText, type Language } from '@/lib/i18n'

type SpeechResult = { results: ArrayLike<{ 0: { transcript: string } }> }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResult) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
}

const speechLocales: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN' }

export function VoiceInput({ value, onValueChange, className = '', id, ...inputProps }: Props) {
  const language = useLocale()
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const statusId = id ? `${id}-voice-status` : undefined
  const t = (text: string) => translateText(text, language)

  useEffect(() => () => recognitionRef.current?.stop(), [])

  function toggleVoiceTyping() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setStatus(t('Voice typing isn’t supported in this browser. You can type in this field.'))
      return
    }

    const recognition = new Recognition()
    recognition.lang = speechLocales[language]
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) {
        onValueChange(value.trim() ? `${value.trim()} ${transcript}` : transcript)
        setStatus('')
      } else {
        setStatus(t('No speech was recognized. Try again.'))
      }
    }
    recognition.onerror = (event) => setStatus(
      event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? t('Voice typing needs microphone permission.')
        : t('Voice typing failed. Try again or type instead.'),
    )
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      setStatus(t('Voice typing is listening. Speak now.'))
    } catch {
      setListening(false)
      setStatus(t('Voice typing needs microphone permission.'))
    }
  }

  return <div className="voice-input-field">
    <div className="voice-input-control">
      <input
        {...inputProps}
        id={id}
        className={`text-input voice-text-input ${className}`.trim()}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-describedby={[inputProps['aria-describedby'], statusId].filter(Boolean).join(' ') || undefined}
      />
      <button
        type="button"
        className={`voice-input-button${listening ? ' is-listening' : ''}`}
        onClick={toggleVoiceTyping}
        aria-label={t(listening ? 'Stop voice typing' : 'Dictate in this field')}
        aria-pressed={listening}
        title={t(listening ? 'Stop voice typing' : 'Voice typing')}
      >
        {listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </button>
    </div>
    <span id={statusId} className="voice-input-status" role="status" aria-live="polite">
      {status}
    </span>
  </div>
}
