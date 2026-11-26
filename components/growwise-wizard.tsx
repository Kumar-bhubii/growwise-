'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, MapPin, Sprout, Droplets, ClipboardCheck, LocateFixed, FlaskConical, Leaf, CloudSun, CircleHelp, Loader2 } from 'lucide-react'
import type { FarmProfile } from '@/lib/growwise'
import { Button } from '@/components/ui/button'
import { TranslateTree, useLocale, translateText } from '@/lib/i18n'
import { VoiceInput } from '@/components/voice-input'

type Props = {
  profile: FarmProfile
  onChange: (profile: FarmProfile) => void
  /** Called when the user clicks the final "See recommendations" button.
   *  Returns a Promise so the wizard can show saving state.
   *  Should resolve with { error: string | null } or void. */
  onComplete: () => Promise<{ error: string | null } | void>
  onBack: () => void
}

const steps = [
  { title: 'Your location', icon: MapPin },
  { title: 'Your soil', icon: Sprout },
  { title: 'Season & water', icon: Droplets },
  { title: 'Review', icon: ClipboardCheck },
]

const seasons = ['Long rains', 'Short rains', 'Winter', 'Summer']

export function GrowWiseWizard({ profile, onChange, onComplete, onBack }: Props) {
  const language = useLocale()
  const t = (text: string) => translateText(text, language)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)
  const update = (key: keyof FarmProfile, value: string) => onChange({ ...profile, [key]: value })
  const reportValues = [profile.nitrogen, profile.phosphorus, profile.potassium].map(Number)
  const phValue = Number(profile.ph)
  const validReport = profile.soilMode !== 'report' || (profile.nitrogen !== '' && profile.phosphorus !== '' && profile.potassium !== '' && profile.ph !== '' && reportValues.every((value) => Number.isFinite(value) && value >= 0) && Number.isFinite(phValue) && phValue >= 0 && phValue <= 14)
  const canContinue = step !== 0 || profile.location.trim().length > 1

  async function next() {
    if (!canContinue) {
      setError('Add a district or region to continue.')
      return
    }
    if (step === 1 && !validReport) {
      setError('Enter non-negative N, P, and K values and a pH from 0 to 14, or choose visual estimate.')
      return
    }
    setError('')
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      // Final step — save and navigate
      setSaving(true)
      setSaveMessage(null)
      try {
        const result = await onComplete()
        if (result && result.error) {
          setSaveMessage({ text: `Profile could not be saved: ${result.error}. Your session continues with these details.`, kind: 'error' })
          setSaving(false)
          // Still let the user continue even if save failed
          setTimeout(() => setSaveMessage(null), 6000)
        }
        // On success onComplete navigates to dashboard — no further action needed
      } catch {
        setSaveMessage({ text: 'Could not save profile. Continuing without saving.', kind: 'error' })
        setSaving(false)
      }
    }
  }

  return (
    <TranslateTree><main className="wizard-shell">
      <div className="wizard-heading">
        <button className="text-button back-welcome" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to welcome</button>
        <div className="wizard-kicker"><Sprout aria-hidden="true" /> FARM SETUP</div>
        <h1>Let&apos;s get to know your farm.</h1>
        <p>A few details help us shape a more useful starting point. You can update these any time.</p>
      </div>
      <div className="wizard-layout">
        <aside className="step-rail" aria-label="Setup progress">
          {steps.map((item, index) => {
            const Icon = item.icon
            return <div key={item.title} className={`step-rail-item ${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`} aria-current={index === step ? 'step' : undefined}>
              <span className="step-dot">{index < step ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
              <span><small>{t(`STEP ${index + 1}`)}</small><strong>{item.title}</strong></span>
            </div>
          })}
        </aside>
        <section className="wizard-card" aria-live="polite">
          <div className="wizard-card-top"><span>{t(`STEP ${step + 1} OF ${steps.length}`)}</span><span>{Math.round(((step + 1) / steps.length) * 100)}% complete</span></div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((step + 1) / steps.length) * 100)}><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
          {step === 0 && <div className="wizard-step">
            <div className="step-icon-box"><MapPin aria-hidden="true" /></div>
            <h2>Where is your farm?</h2>
            <p>Choose your district or region. We won&apos;t request your precise location unless you ask us to.</p>
            <label className="input-label" htmlFor="region">District or region</label>
            <VoiceInput id="region" value={profile.location} onValueChange={(value) => update('location', value)} placeholder="e.g. Kisumu County" autoComplete="address-level1" />
            <button className="location-action" onClick={() => setError('Location access is optional and not enabled in this demo. Please enter your region above.')}><LocateFixed aria-hidden="true" /> Use my location <span>Optional</span></button>
            <div className="inline-note"><CircleHelp aria-hidden="true" /> Choosing your area helps keep future advice locally relevant. This demo does not fetch regional data.</div>
          </div>}
          {step === 1 && <div className="wizard-step">
            <div className="step-icon-box"><Sprout aria-hidden="true" /></div>
            <h2>What do you know about your soil?</h2>
            <p>Use a lab report if you have one, or make a quick visual estimate.</p>
            <div className="choice-grid two">
              <button className={`choice-card ${profile.soilMode === 'report' ? 'selected' : ''}`} onClick={() => update('soilMode', 'report')} aria-pressed={profile.soilMode === 'report'}><FlaskConical aria-hidden="true" /><strong>I have a soil report</strong><span>Enter N, P, K and pH values</span></button>
              <button className={`choice-card ${profile.soilMode === 'visual' ? 'selected' : ''}`} onClick={() => update('soilMode', 'visual')} aria-pressed={profile.soilMode === 'visual'}><Leaf aria-hidden="true" /><strong>I don&apos;t have a report</strong><span>Use a rough visual estimate</span></button>
            </div>
            {profile.soilMode === 'report' ? <div className="soil-values">
              <p className="field-intro">Enter the values shown on your test report. Units vary by lab—use the units printed on yours.</p>
              <div className="soil-grid">{(['nitrogen', 'phosphorus', 'potassium', 'ph'] as const).map((key) => <label className="input-label" key={key} htmlFor={key}>{key === 'ph' ? 'Soil pH' : `${key[0].toUpperCase()}${key.slice(1)}`}<input id={key} className="text-input" type="number" inputMode="decimal" min={key === 'ph' ? '0' : '0'} step="any" value={profile[key]} onChange={(e) => update(key, e.target.value)} placeholder={key === 'ph' ? 'e.g. 6.5' : 'Value from report'} /><small>{key === 'ph' ? 'No unit' : 'Use report unit'}</small></label>)}</div>
            </div> : <div className="visual-soil">
              <div className="rough-label"><span><Leaf aria-hidden="true" /> Rough estimate</span><small>Not a lab measurement</small></div>
              <div className="soil-grid">{[
                { key: 'texture' as const, label: 'Soil texture', options: ['Loamy', 'Sandy', 'Clayey', 'Not sure'] },
                { key: 'soilColor' as const, label: 'Soil color', options: ['Dark brown', 'Red-brown', 'Pale / sandy', 'Not sure'] },
                { key: 'moisture' as const, label: 'Moisture today', options: ['Somewhat moist', 'Dry', 'Quite wet', 'Not sure'] },
              ].map((field) => <label className="input-label" key={field.key} htmlFor={field.key}>{field.label}<select id={field.key} className="text-input select-input" value={profile[field.key]} onChange={(e) => update(field.key, e.target.value)}>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>)}</div>
              <div className="inline-note"><CircleHelp aria-hidden="true" /> Soil appearance can be misleading. A soil test or local expert can give a more reliable picture.</div>
            </div>}
          </div>}
          {step === 2 && <div className="wizard-step">
            <div className="step-icon-box"><CloudSun aria-hidden="true" /></div>
            <h2>What season are you planning for?</h2>
            <p>These are editable examples. Choose the wording that makes sense for your region.</p>
            <div className="choice-grid season-grid">{seasons.map((season) => <button key={season} className={`season-choice ${profile.season === season ? 'selected' : ''}`} onClick={() => update('season', season)} aria-pressed={profile.season === season}><CloudSun aria-hidden="true" />{season}</button>)}</div>
            <label className="input-label spaced-label" htmlFor="season-custom">Or enter a local season name</label><VoiceInput id="season-custom" value={seasons.includes(profile.season) ? '' : profile.season} onValueChange={(value) => update('season', value)} placeholder="e.g. post-monsoon" />
            <fieldset className="water-field"><legend className="input-label">Water access</legend><div className="choice-grid two">
              {['Rainfed', 'Irrigation'].map((water) => <button type="button" key={water} className={`choice-card water-choice ${profile.water === water ? 'selected' : ''}`} onClick={() => update('water', water)} aria-pressed={profile.water === water}><Droplets aria-hidden="true" /><strong>{water}</strong><span>{water === 'Rainfed' ? 'Mainly depends on rainfall' : 'A water source is available'}</span></button>)}
            </div></fieldset>
            {profile.water === 'Irrigation' && <label className="input-label spaced-label" htmlFor="source">Water source <span className="optional-label">Optional</span><VoiceInput id="source" value={profile.waterSource} onValueChange={(value) => update('waterSource', value)} placeholder="e.g. well, canal, river" /></label>}
            <div className="soil-grid constraints-grid"><label className="input-label" htmlFor="budget">Budget preference <select id="budget" className="text-input select-input" value={profile.budget} onChange={(e) => update('budget', e.target.value)}><option>Careful budget</option><option>Flexible budget</option><option>Prefer not to say</option></select></label><label className="input-label" htmlFor="fertilizer">Fertilizer access <select id="fertilizer" className="text-input select-input" value={profile.fertilizer} onChange={(e) => update('fertilizer', e.target.value)}><option>Limited access</option><option>Usually available</option><option>Prefer not to say</option></select></label></div>
          </div>}
          {step === 3 && <div className="wizard-step review-step">
            <div className="step-icon-box"><ClipboardCheck aria-hidden="true" /></div><h2>A quick review</h2><p>Check your farm details before viewing the sample recommendations.</p>
            <div className="review-list">
              <div><MapPin aria-hidden="true" /><span><small>LOCATION</small><strong>{profile.location ? <span data-no-translate="true">{profile.location}</span> : 'Not provided'}</strong></span><button className="text-button" onClick={() => setStep(0)}>Edit</button></div>
              <div><Sprout aria-hidden="true" /><span><small>SOIL INPUT</small><strong>{profile.soilMode === 'report' ? `Lab report · N ${profile.nitrogen || '—'} · P ${profile.phosphorus || '—'} · K ${profile.potassium || '—'} · pH ${profile.ph || '—'}` : `Visual estimate · ${profile.texture}, ${profile.soilColor.toLowerCase()}, ${profile.moisture.toLowerCase()}`}</strong></span><button className="text-button" onClick={() => setStep(1)}>Edit</button></div>
              <div><CloudSun aria-hidden="true" /><span><small>SEASON & WATER</small><strong>{['Long rains', 'Short rains', 'Winter', 'Summer'].includes(profile.season) ? profile.season : <span data-no-translate="true">{profile.season}</span>} · {profile.water}{profile.waterSource ? <> · <span data-no-translate="true">{profile.waterSource}</span></> : ''}</strong></span><button className="text-button" onClick={() => setStep(2)}>Edit</button></div>
              <div><Leaf aria-hidden="true" /><span><small>RESOURCES</small><strong>{profile.budget} · {profile.fertilizer}</strong></span><button className="text-button" onClick={() => setStep(2)}>Edit</button></div>
            </div>
            <div className="demo-warning"><CircleHelp aria-hidden="true" /><span><strong>Demo recommendations only.</strong> Weather is unavailable, and these examples are not validated for your location. Check important decisions with a local agricultural expert.</span></div>
          </div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {saveMessage && (
            <p
              className="form-error"
              role="alert"
              style={saveMessage.kind === 'success' ? { color: 'var(--color-success, #166534)', background: 'rgba(22,101,52,0.08)', borderColor: 'rgba(22,101,52,0.2)' } : undefined}
            >
              {saveMessage.text}
            </p>
          )}
          <div className="wizard-actions">{step > 0 ? <Button variant="outline" size="lg" onClick={() => { setError(''); setStep(step - 1) }}><ArrowLeft data-icon="inline-start" /> Back</Button> : <span />}
            <Button className="primary-button" size="lg" onClick={next} disabled={saving}>
              {saving
                ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" /> Saving…</>
                : <>{step === 3 ? 'See sample recommendations' : 'Continue'}<ArrowRight data-icon="inline-end" /></>}
            </Button></div>
        </section>
      </div>
    </main></TranslateTree>
  )
}
