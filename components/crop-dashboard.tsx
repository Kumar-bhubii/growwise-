'use client'

import {
  ArrowRight, ChevronRight, CircleAlert, CloudOff, FlaskConical, Leaf,
  MapPin, Pencil, Sprout, Sun, X, Check, BookOpen, MessageCircle,
  CircleHelp, RotateCcw, Wheat, Loader2, Cloud, CloudRain, CloudSnow,
  Zap, Thermometer, Wind, Droplets, Calendar,
} from 'lucide-react'
import type { Crop, FarmProfile, WeatherState, CropsState } from '@/lib/growwise'
import { categoryLabels } from '@/lib/growwise'
import { Button } from '@/components/ui/button'
import { TranslateTree } from '@/lib/i18n'

const groups: Crop['category'][] = ['good', 'caution', 'avoid']

// ── Weather icon helper ───────────────────────────────────────────────────────

function WeatherIcon({ code, size = 13 }: { code: number; size?: number }) {
  if (code <= 2) return <Sun aria-hidden="true" size={size} />
  if (code === 3) return <Cloud aria-hidden="true" size={size} />
  if (code <= 69) return <CloudRain aria-hidden="true" size={size} />
  if (code <= 79) return <CloudSnow aria-hidden="true" size={size} />
  if (code <= 84) return <CloudRain aria-hidden="true" size={size} />
  return <Zap aria-hidden="true" size={size} />
}

// ── Weather card ──────────────────────────────────────────────────────────────

function WeatherCard({ weather }: { weather: WeatherState }) {
  if (weather.status === 'idle') {
    return (
      <section className="summary-card weather-card">
        <div className="summary-card-head">
          <span className="summary-icon"><CloudOff aria-hidden="true" /></span>
          <span className="summary-label">LOCAL WEATHER</span>
        </div>
        <strong>Weather not loaded</strong>
        <small>Will fetch when dashboard opens</small>
      </section>
    )
  }

  if (weather.status === 'loading') {
    return (
      <section className="summary-card weather-card">
        <div className="summary-card-head">
          <span className="summary-icon"><Cloud aria-hidden="true" /></span>
          <span className="summary-label">LOCAL WEATHER</span>
        </div>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4em', color: '#68746a' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
          Fetching weather…
        </strong>
        <small>Contacting Open-Meteo</small>
      </section>
    )
  }

  if (weather.status === 'error') {
    return (
      <section className="summary-card weather-card">
        <div className="summary-card-head">
          <span className="summary-icon"><CloudOff aria-hidden="true" /></span>
          <span className="summary-label">LOCAL WEATHER</span>
        </div>
        <strong style={{ color: '#a54632', fontSize: '11px' }}>
          {weather.notFound ? 'Location not found' : 'Weather unavailable'}
        </strong>
        <small style={{ color: '#a54632' }}>{weather.message}</small>
      </section>
    )
  }

  // success
  const { data } = weather
  const fetchedDate = new Date(data.fetchedAt)
  const timeStr = fetchedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <section className="summary-card weather-card weather-live">
      <div className="summary-card-head">
        <span className="summary-icon"><WeatherIcon code={data.currentWeatherCode} /></span>
        <span className="summary-label">LOCAL WEATHER</span>
      </div>
      <strong data-no-translate="true">{data.location}</strong>
      <div className="weather-current">
        <span className="weather-temp" data-no-translate="true">{data.currentTempC}°C</span>
        <span className="weather-desc">{data.currentDescription}</span>
      </div>
      <div className="weather-meta">
        <span><Thermometer size={10} aria-hidden="true" /> Feels {data.currentFeelsLikeC}°C</span>
        <span><Droplets size={10} aria-hidden="true" /> {data.currentHumidityPct}%</span>
        <span><Wind size={10} aria-hidden="true" /> {data.currentWindKph} km/h</span>
      </div>
      <div className="weather-forecast-strip">
        {data.forecast.slice(1, 5).map((day) => {
          const label = new Date(day.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' })
          return (
            <div key={day.date} className="forecast-day">
              <span className="forecast-dow">{label}</span>
              <WeatherIcon code={day.weatherCode} size={11} />
              <span className="forecast-temps" data-no-translate="true">
                {day.tempMaxC}° / {day.tempMinC}°
              </span>
              {day.precipMm > 0 && (
                <span className="forecast-precip" data-no-translate="true">{day.precipMm}mm</span>
              )}
            </div>
          )
        })}
      </div>
      <small className="weather-footer">
        Forecast estimates · <span data-no-translate="true">Open-Meteo</span> · fetched {timeStr}
      </small>
    </section>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function CropDashboard({
  profile,
  cropsState,
  weather,
  onEdit,
  onStartOver,
  onDetails,
  onAsk,
}: {
  profile: FarmProfile
  cropsState: CropsState
  weather: WeatherState
  onEdit: () => void
  onStartOver: () => void
  onDetails: (crop: Crop) => void
  onAsk: (crop: Crop) => void
}) {
  // Determine what crops to show
  const crops: Crop[] = cropsState.status === 'success' ? cropsState.crops : []
  const isLive = cropsState.status === 'success'
  const isDemo = cropsState.status === 'idle' || cropsState.status === 'error'
  const dataSourceNote = cropsState.status === 'success' ? cropsState.dataSourceNote : null
  const faoAvailable = cropsState.status === 'success' ? cropsState.faoDataAvailable : false
  const unverifiedRegion = cropsState.status === 'success' ? cropsState.unverifiedRegion : true

  return (
    <TranslateTree>
      <main className="dashboard-main">
        {/* Only show offline strip when crops couldn't load */}
        {cropsState.status === 'error' && (
          <div className="offline-strip">
            <span><CloudOff aria-hidden="true" /> Recommendations unavailable</span>
            <span>{cropsState.message} Showing sample demo data.</span>
            <button aria-label="Dismiss notice" onClick={(e) => e.currentTarget.parentElement?.remove()}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="dashboard-welcome">
          <div>
            <div className="eyebrow">
              YOUR FARM SNAPSHOT{' '}
              {!isLive && <span className="demo-pill">SAMPLE DEMO DATA</span>}
              {isLive && !faoAvailable && <span className="demo-pill">UNVERIFIED REGION</span>}
            </div>
            <h1>
              Good morning,{' '}
              {profile.name ? <span data-no-translate="true">{profile.name}</span> : 'farmer'}.
            </h1>
            <p>
              {isLive
                ? unverifiedRegion
                  ? 'Here\'s a starting point based on your inputs. Regional data is limited — verify locally.'
                  : 'Here\'s a starting point shaped by your inputs and FAO crop data for your region.'
                : 'Here\'s a starting point shaped by the details you shared.'}
            </p>
          </div>
          <div className="dash-actions">
            <Button variant="outline" size="lg" onClick={onEdit}>
              <Pencil data-icon="inline-start" /> Edit inputs
            </Button>
            <Button variant="ghost" size="lg" onClick={onStartOver}>
              <RotateCcw data-icon="inline-start" /> Start over
            </Button>
          </div>
        </div>

        {/* Advisory banner */}
        <div className="decision-banner">
          <span className="banner-icon"><CircleAlert aria-hidden="true" /></span>
          <div>
            <strong>Use these as a conversation starter, not a prescription.</strong>
            <p>
              {isLive && faoAvailable
                ? 'Recommendations use FAO Crop Calendar planting windows and published agronomic references. They do not account for local variety performance, pest pressure, or field-level conditions.'
                : isLive
                ? 'FAO Crop Calendar data is unavailable for this region. Suggestions are based on published soil and water references only — treat them as examples.'
                : 'Weather is unavailable. These fixed sample cards do not recalculate from your inputs or verify local suitability.'}
              {' '}Check with a local agricultural expert.
            </p>
          </div>
          <button aria-label="Dismiss advisory" onClick={(e) => e.currentTarget.parentElement?.remove()}>
            <X aria-hidden="true" />
          </button>
        </div>

        {/* Summary grid */}
        <div className="summary-grid">
          <section className="summary-card">
            <div className="summary-card-head">
              <span className="summary-icon"><MapPin aria-hidden="true" /></span>
              <span className="summary-label">FARM LOCATION</span>
            </div>
            <strong><span data-no-translate="true">{profile.location}</span></strong>
            <small>Manually entered region</small>
          </section>

          <section className="summary-card">
            <div className="summary-card-head">
              <span className="summary-icon"><Sprout aria-hidden="true" /></span>
              <span className="summary-label">SOIL PROFILE</span>
            </div>
            <strong>{profile.soilMode === 'report' ? 'Soil report entered' : `${profile.texture} soil`}</strong>
            <small>
              {profile.soilMode === 'report'
                ? `N ${profile.nitrogen} · P ${profile.phosphorus} · K ${profile.potassium} · pH ${profile.ph}`
                : `Visual estimate · ${profile.soilColor.toLowerCase()}`}
            </small>
          </section>

          <section className="summary-card">
            <div className="summary-card-head">
              <span className="summary-icon"><Sun aria-hidden="true" /></span>
              <span className="summary-label">SEASON &amp; WATER</span>
            </div>
            <strong>
              {['Long rains', 'Short rains', 'Winter', 'Summer'].includes(profile.season)
                ? profile.season
                : <span data-no-translate="true">{profile.season}</span>}
              {' '}· {profile.water}
            </strong>
            <small>
              {profile.waterSource ? <span data-no-translate="true">{profile.waterSource}</span> : 'No source added'}
            </small>
          </section>

          <WeatherCard weather={weather} />
        </div>

        {/* Recommendations */}
        <section className="recommendations-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">A FEW OPTIONS TO EXPLORE</div>
              <h2>Crop considerations</h2>
            </div>
            {cropsState.status === 'loading' ? (
              <span className="sample-label">
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
                Loading recommendations…
              </span>
            ) : isLive ? (
              <span className="sample-label">
                <Leaf aria-hidden="true" />
                {faoAvailable ? 'FAO data + agronomic references' : 'Agronomic references · verify locally'}
              </span>
            ) : (
              <span className="sample-label">
                <Leaf aria-hidden="true" /> Fixed sample cards · not calculated
              </span>
            )}
          </div>

          {/* Data source note */}
          {dataSourceNote && (
            <div className="data-source-note">
              <FlaskConical aria-hidden="true" size={12} />
              <span>{dataSourceNote}</span>
            </div>
          )}

          {cropsState.status === 'loading' && (
            <div className="crops-loading">
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
              <span>Fetching crop data from FAO and agronomic references…</span>
            </div>
          )}

          {(cropsState.status !== 'loading') && (
            <div className="crop-groups">
              {groups.map((group) => {
                const entries = crops.filter((c) => c.category === group)
                return (
                  <section className={`crop-group group-${group}`} key={group}>
                    <div className="group-heading">
                      <span className="group-mark">
                        {group === 'good' ? <Check aria-hidden="true" /> : group === 'caution' ? <CircleAlert aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}
                      </span>
                      <div>
                        <h3>{categoryLabels[group]}</h3>
                        <p>
                          {group === 'good'
                            ? 'Worth exploring further'
                            : group === 'caution'
                            ? 'Check the details first'
                            : 'Based on your current inputs'}
                        </p>
                      </div>
                      <span className="group-count">
                        {entries.length} {entries.length === 1 ? 'option' : 'options'}
                      </span>
                    </div>
                    {entries.length ? (
                      <div className="crop-card-list">
                        {entries.map((crop) => (
                          <CropCard
                            key={crop.name}
                            crop={crop}
                            isLive={isLive}
                            onDetails={() => onDetails(crop)}
                            onAsk={() => onAsk(crop)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="empty-group">No options in this group.</p>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </section>

        <div className="dashboard-bottom">
          <section className="help-card">
            <div className="help-icon"><BookOpen aria-hidden="true" /></div>
            <div>
              <strong>Growing guidance, grounded in your community</strong>
              <p>Our crop guides are general starting points. Local expertise matters most.</p>
            </div>
            <button onClick={() => crops.length > 0 && onDetails(crops[0])}>
              Browse crop guide <ChevronRight aria-hidden="true" />
            </button>
          </section>
          <section className="expert-card">
            <div className="expert-icon"><MessageCircle aria-hidden="true" /></div>
            <div>
              <strong>Talk to a local expert</strong>
              <p>Local contact details haven&apos;t been added to this prototype.</p>
              <button onClick={() => crops.length > 0 && onAsk(crops[0])}>
                Ask the assistant instead <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>

        <div className="disclaimer-footer">
          <FlaskConical aria-hidden="true" />
          <span>
            Decision-support prototype. Crop suggestions use FAO Crop Calendar data and published agronomic references where available.
            No yield, income, or crop-success outcomes are promised. Verify all recommendations before acting.
          </span>
        </div>
      </main>
    </TranslateTree>
  )
}

// ── Crop card ─────────────────────────────────────────────────────────────────

function CropCard({
  crop,
  isLive,
  onDetails,
  onAsk,
}: {
  crop: Crop
  isLive: boolean
  onDetails: () => void
  onAsk: () => void
}) {
  const tagLabel = crop.category === 'good'
    ? isLive ? 'Compatible · verify locally' : 'Good potential · demo'
    : crop.category === 'caution'
    ? 'Consider with caution'
    : isLive ? 'Lower priority based on inputs' : 'Lower priority · demo'

  return (
    <TranslateTree>
      <article className="crop-card">
        <div className={`crop-illustration crop-${crop.category}`} aria-hidden="true">
          <span>
            {crop.name === 'Sorghum' || crop.name === 'Maize' || crop.name === 'Millet (finger)'
              ? <Wheat />
              : crop.name === 'Beans (common)' || crop.name === 'Cowpea' || crop.name === 'Groundnut'
              ? <Leaf />
              : <Sprout />}
          </span>
          <i /><i /><i />
        </div>
        <div className="crop-card-content">
          <div className="crop-card-title">
            <div>
              <span className={`suitability-tag tag-${crop.category}`}>{tagLabel}</span>
              <h4>{crop.name}</h4>
            </div>
            <button className="card-arrow" onClick={onDetails} aria-label={`View ${crop.name} details`}>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <p className="crop-summary">{crop.summary}</p>
          <div className="factor-row">
            <strong>Factors considered</strong>
            <div>{crop.factors.slice(0, 3).map((factor) => <span key={factor}>{factor}</span>)}</div>
          </div>
          {crop.faoPlantingWindow && (
            <div className="fao-window-row">
              <Calendar size={9} aria-hidden="true" />
              <span>FAO planting window ({crop.faoCountry}): {crop.faoPlantingWindow}</span>
            </div>
          )}
          <div className="crop-card-bottom">
            <span>
              <CircleAlert aria-hidden="true" />
              {isLive ? 'Verify locally · not a prescription' : 'Demo example, verify locally'}
            </span>
            <div>
              <button className="text-button" onClick={onDetails}>View details</button>
              <button className="ask-inline" onClick={onAsk}>
                <MessageCircle aria-hidden="true" /> Ask assistant
              </button>
            </div>
          </div>
        </div>
      </article>
    </TranslateTree>
  )
}

// ── Crop detail panel ─────────────────────────────────────────────────────────

export function CropDetail({
  crop,
  profile,
  onClose,
  onAsk,
}: {
  crop: Crop
  profile: FarmProfile
  onClose: () => void
  onAsk: () => void
}) {
  const isLive = crop.evidenceSource && !crop.evidenceSource.includes('Demo')

  return (
    <TranslateTree>
      <div
        className="modal-backdrop"
        role="presentation"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <section
          className="detail-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          <button className="dialog-close" onClick={onClose} aria-label="Close crop details">
            <X aria-hidden="true" />
          </button>

          <div className={`detail-hero crop-${crop.category}`}>
            <span className="detail-crop-icon" aria-hidden="true">
              {crop.name === 'Sorghum' || crop.name === 'Maize' || crop.name === 'Millet (finger)'
                ? <Wheat />
                : crop.name === 'Beans (common)' || crop.name === 'Cowpea' || crop.name === 'Groundnut'
                ? <Leaf />
                : <Sprout />}
            </span>
            <span className={`suitability-tag tag-${crop.category}`}>
              {categoryLabels[crop.category]} {!isLive && '· demo'}
            </span>
            <h2 id="detail-title">{crop.name}</h2>
            <p>{crop.summary}</p>
          </div>

          <div className="detail-scroll">
            <section className="detail-section">
              <h3>Why it appears here</h3>
              <p>{crop.why}</p>
              <div className="detail-factor-list">
                {crop.factors.map((factor) => (
                  <span key={factor}><Check aria-hidden="true" /> {factor}</span>
                ))}
              </div>

              {/* FAO calendar window if available */}
              {crop.faoPlantingWindow && (
                <div className="fao-detail-box">
                  <Calendar size={12} aria-hidden="true" />
                  <div>
                    <strong>FAO Crop Calendar — {crop.faoCountry}</strong>
                    <p>
                      Planting window: {crop.faoPlantingWindow}
                      {crop.faoHarvestWindow && ` · Harvest window: ${crop.faoHarvestWindow}`}
                    </p>
                    <small>
                      This is evidence of a typical planting period in this country — not proof of suitability for your specific field.
                    </small>
                  </div>
                </div>
              )}

              {/* Evidence source */}
              {crop.evidenceSource && (
                <div className="evidence-source-box">
                  <FlaskConical size={11} aria-hidden="true" />
                  <span>Source: {crop.evidenceSource}</span>
                </div>
              )}
            </section>

            <section className="detail-section">
              <h3>What we know &amp; what&apos;s missing</h3>
              <div className="known-grid">
                <div>
                  <strong><Check aria-hidden="true" /> From your inputs</strong>
                  <p>
                    <span data-no-translate="true">{profile.location}</span>,{' '}
                    {profile.season.toLowerCase()},{' '}
                    {profile.water.toLowerCase()} water access,{' '}
                    {profile.soilMode === 'report'
                      ? 'soil report values entered'
                      : `${profile.texture.toLowerCase()} visual soil estimate`}.
                  </p>
                </div>
                <div>
                  <strong><CircleHelp aria-hidden="true" /> Still to verify</strong>
                  <p>
                    {crop.dataGaps && crop.dataGaps.length > 0
                      ? crop.dataGaps.slice(0, 2).join(' ')
                      : 'Current weather, local variety performance, field drainage, and region-specific planting guidance.'}
                  </p>
                </div>
              </div>
              <div className="caution-box">
                <CircleAlert aria-hidden="true" />{crop.caution}
              </div>
            </section>

            <section className="detail-section">
              <div className="guide-heading">
                <div>
                  <h3>A general growing guide</h3>
                  <p>Starter information only · verify each step locally</p>
                </div>
                <span className="general-tag">GENERAL</span>
              </div>
              <ol className="guide-list">
                {['Land preparation', 'Planting', 'Care &amp; watering', 'Harvest planning'].map(
                  (label, index) => (
                    <li key={label}>
                      <span className="guide-number">0{index + 1}</span>
                      <div>
                        <strong dangerouslySetInnerHTML={{ __html: label }} />
                        <p>{crop.guide[index]}</p>
                      </div>
                    </li>
                  )
                )}
              </ol>
            </section>

            <section className="expert-placeholder">
              <div>
                <strong>Need region-specific advice?</strong>
                <p>Local agricultural expert contacts can be configured for your community.</p>
              </div>
              <Button variant="outline" onClick={onAsk}>Ask how to find an expert</Button>
            </section>
          </div>

          <div className="detail-footer">
            <span>
              {isLive
                ? 'Based on FAO data and agronomic references · verify locally'
                : 'Sample guidance · not a verified prescription'}
            </span>
            <Button className="primary-button" onClick={onAsk}>
              <MessageCircle data-icon="inline-start" /> Ask about this crop
            </Button>
          </div>
        </section>
      </div>
    </TranslateTree>
  )
}
