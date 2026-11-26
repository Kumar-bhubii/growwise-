'use client'

import { ArrowRight, ChevronRight, CircleAlert, CloudOff, FlaskConical, Leaf, MapPin, Pencil, Sprout, Sun, X, Check, BookOpen, MessageCircle, CircleHelp, RotateCcw, Wheat } from 'lucide-react'
import type { Crop, FarmProfile } from '@/lib/growwise'
import { categoryLabels } from '@/lib/growwise'
import { Button } from '@/components/ui/button'
import { TranslateTree } from '@/lib/i18n'

const groups: Crop['category'][] = ['good', 'caution', 'avoid']

export function CropDashboard({ profile, crops, onEdit, onStartOver, onDetails, onAsk }: { profile: FarmProfile; crops: Crop[]; onEdit: () => void; onStartOver: () => void; onDetails: (crop: Crop) => void; onAsk: (crop: Crop) => void }) {
  return <TranslateTree><main className="dashboard-main">
    <div className="offline-strip"><span><CloudOff aria-hidden="true" /> Limited connection</span><span>Some information may not be up to date. Recommendations are sample demo data.</span><button aria-label="Dismiss connection notice" onClick={(e) => e.currentTarget.parentElement?.remove()}><X aria-hidden="true" /></button></div>
    <div className="dashboard-welcome">
      <div><div className="eyebrow">YOUR FARM SNAPSHOT <span className="demo-pill">SAMPLE DEMO DATA</span></div><h1>Good morning, {profile.name ? <span data-no-translate="true">{profile.name}</span> : 'farmer'}.</h1><p>Here&apos;s a starting point shaped by the details you shared.</p></div>
      <div className="dash-actions"><Button variant="outline" size="lg" onClick={onEdit}><Pencil data-icon="inline-start" /> Edit inputs</Button><Button variant="ghost" size="lg" onClick={onStartOver}><RotateCcw data-icon="inline-start" /> Start over</Button></div>
    </div>
    <div className="decision-banner"><span className="banner-icon"><CircleAlert aria-hidden="true" /></span><div><strong>Use these examples as a conversation starter, not a prescription.</strong><p>Weather is unavailable. These fixed sample cards do not recalculate from your inputs or verify local suitability. Check with a local agricultural expert.</p></div><button aria-label="Dismiss advisory" onClick={(e) => e.currentTarget.parentElement?.remove()}><X aria-hidden="true" /></button></div>
    <div className="summary-grid">
      <section className="summary-card"><div className="summary-card-head"><span className="summary-icon"><MapPin aria-hidden="true" /></span><span className="summary-label">FARM LOCATION</span></div><strong><span data-no-translate="true">{profile.location}</span></strong><small>Manually entered region</small></section>
      <section className="summary-card"><div className="summary-card-head"><span className="summary-icon"><Sprout aria-hidden="true" /></span><span className="summary-label">SOIL PROFILE</span></div><strong>{profile.soilMode === 'report' ? 'Soil report entered' : `${profile.texture} soil`}</strong><small>{profile.soilMode === 'report' ? `N ${profile.nitrogen} · P ${profile.phosphorus} · K ${profile.potassium} · pH ${profile.ph}` : `Visual estimate · ${profile.soilColor.toLowerCase()}`}</small></section>
      <section className="summary-card"><div className="summary-card-head"><span className="summary-icon"><Sun aria-hidden="true" /></span><span className="summary-label">SEASON & WATER</span></div><strong>{['Long rains', 'Short rains', 'Winter', 'Summer'].includes(profile.season) ? profile.season : <span data-no-translate="true">{profile.season}</span>} · {profile.water}</strong><small>{profile.waterSource ? <span data-no-translate="true">{profile.waterSource}</span> : 'No source added'}</small></section>
      <section className="summary-card weather-card"><div className="summary-card-head"><span className="summary-icon"><CloudOff aria-hidden="true" /></span><span className="summary-label">LOCAL WEATHER</span></div><strong>Weather unavailable</strong><small>Source not connected · last checked —</small></section>
    </div>
    <section className="recommendations-section">
      <div className="section-heading"><div><div className="eyebrow">A FEW OPTIONS TO EXPLORE</div><h2>Crop considerations</h2></div><span className="sample-label"><Leaf aria-hidden="true" /> Fixed sample cards · not calculated</span></div>
      <div className="crop-groups">{groups.map((group) => {
        const entries = crops.filter((crop) => crop.category === group)
        const className = `crop-group group-${group}`
        return <section className={className} key={group}>
          <div className="group-heading"><span className="group-mark">{group === 'good' ? <Check aria-hidden="true" /> : group === 'caution' ? <CircleAlert aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}</span><div><h3>{categoryLabels[group]}</h3><p>{group === 'good' ? 'Worth exploring further' : group === 'caution' ? 'Check the details first' : 'Based on your current inputs'}</p></div><span className="group-count">{entries.length} {entries.length === 1 ? 'option' : 'options'}</span></div>
          {entries.length ? <div className="crop-card-list">{entries.map((crop) => <CropCard key={crop.name} crop={crop} onDetails={() => onDetails(crop)} onAsk={() => onAsk(crop)} />)}</div> : <p className="empty-group">No sample options in this group.</p>}
        </section>
      })}</div>
    </section>
    <div className="dashboard-bottom"><section className="help-card"><div className="help-icon"><BookOpen aria-hidden="true" /></div><div><strong>Growing guidance, grounded in your community</strong><p>Our crop guides are general starting points. Local expertise matters most.</p></div><button onClick={() => onDetails(crops[0])}>Browse crop guide <ChevronRight aria-hidden="true" /></button></section>
      <section className="expert-card"><div className="expert-icon"><MessageCircle aria-hidden="true" /></div><div><strong>Talk to a local expert</strong><p>Local contact details haven&apos;t been added to this prototype.</p><button onClick={() => onAsk(crops[0])}>Ask the assistant instead <ArrowRight aria-hidden="true" /></button></div></section></div>
    <div className="disclaimer-footer"><FlaskConical aria-hidden="true" /><span>Decision-support prototype. No yield, income, or crop-success outcomes are promised. Verify local recommendations before acting.</span></div>
  </main></TranslateTree>
}

function CropCard({ crop, onDetails, onAsk }: { crop: Crop; onDetails: () => void; onAsk: () => void }) {
  return <TranslateTree><article className="crop-card">
    <div className={`crop-illustration crop-${crop.category}`} aria-hidden="true"><span>{crop.name === 'Sorghum' ? <Wheat /> : crop.name === 'Beans' ? <Leaf /> : <Sprout />}</span><i /><i /><i /></div>
    <div className="crop-card-content"><div className="crop-card-title"><div><span className={`suitability-tag tag-${crop.category}`}>{crop.category === 'good' ? 'Good potential · demo' : crop.category === 'caution' ? 'Consider with caution' : 'Lower priority · demo'}</span><h4>{crop.name}</h4></div><button className="card-arrow" onClick={onDetails} aria-label={`View ${crop.name} details`}><ArrowRight aria-hidden="true" /></button></div>
      <p className="crop-summary">{crop.summary}</p><div className="factor-row"><strong>Factors considered</strong><div>{crop.factors.map((factor) => <span key={factor}>{factor}</span>)}</div></div>
      <div className="crop-card-bottom"><span><CircleAlert aria-hidden="true" /> Demo example, verify locally</span><div><button className="text-button" onClick={onDetails}>View details</button><button className="ask-inline" onClick={onAsk}><MessageCircle aria-hidden="true" /> Ask assistant</button></div></div>
    </div>
  </article></TranslateTree>
}

export function CropDetail({ crop, profile, onClose, onAsk }: { crop: Crop; profile: FarmProfile; onClose: () => void; onAsk: () => void }) {
  return <TranslateTree><div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <button className="dialog-close" onClick={onClose} aria-label="Close crop details"><X aria-hidden="true" /></button>
    <div className={`detail-hero crop-${crop.category}`}><span className="detail-crop-icon" aria-hidden="true">{crop.name === 'Sorghum' ? <Wheat /> : crop.name === 'Beans' ? <Leaf /> : <Sprout />}</span><span className={`suitability-tag tag-${crop.category}`}>{categoryLabels[crop.category]} · demo</span><h2 id="detail-title">{crop.name}</h2><p>{crop.summary}</p></div>
    <div className="detail-scroll"><section className="detail-section"><h3>Why it appears here</h3><p>{crop.why}</p><div className="detail-factor-list">{crop.factors.map((factor) => <span key={factor}><Check aria-hidden="true" /> {factor}</span>)}</div></section>
      <section className="detail-section"><h3>What we know & what&apos;s missing</h3><div className="known-grid"><div><strong><Check aria-hidden="true" /> From your inputs</strong><p><span data-no-translate="true">{profile.location}</span>, {profile.season.toLowerCase()}, {profile.water.toLowerCase()} water access, {profile.soilMode === 'report' ? 'soil report values entered' : `${profile.texture.toLowerCase()} visual soil estimate`}.</p></div><div><strong><CircleHelp aria-hidden="true" /> Still to verify</strong><p>Current weather, local variety performance, field drainage, and region-specific planting guidance.</p></div></div><div className="caution-box"><CircleAlert aria-hidden="true" />{crop.caution}</div></section>
      <section className="detail-section"><div className="guide-heading"><div><h3>A general growing guide</h3><p>Starter information only · verify each step locally</p></div><span className="general-tag">GENERAL</span></div><ol className="guide-list">{['Land preparation', 'Planting', 'Care & watering', 'Harvest planning'].map((label, index) => <li key={label}><span className="guide-number">0{index + 1}</span><div><strong>{label}</strong><p>{crop.guide[index]}</p></div></li>)}</ol></section>
      <section className="expert-placeholder"><div><strong>Need region-specific advice?</strong><p>Local agricultural expert contacts can be configured for your community.</p></div><Button variant="outline" onClick={onAsk}>Ask how to find an expert</Button></section>
    </div>
    <div className="detail-footer"><span>Sample guidance · not a verified prescription</span><Button className="primary-button" onClick={onAsk}><MessageCircle data-icon="inline-start" /> Ask about this crop</Button></div>
  </section></div></TranslateTree>
}
