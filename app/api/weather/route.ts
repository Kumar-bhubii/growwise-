/**
 * /api/weather
 *
 * Server-side route — no API key required. Open-Meteo is free and open.
 *
 * Flow:
 *   1. Accept POST { location: string }
 *   2. Geocode with Open-Meteo Geocoding API (resolve lat/lon + display name)
 *   3. Fetch current conditions + 7-day daily forecast from Open-Meteo Forecast API
 *   4. Return structured JSON; cache results per normalised location string for 30 min
 *
 * Forecast values are estimates — label them as such in the UI.
 *
 * Data source: https://open-meteo.com (free, no key needed)
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ── In-memory cache (per server instance, TTL 30 min) ───────────────────────

type CacheEntry = { data: WeatherResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

// ── Types ────────────────────────────────────────────────────────────────────

export type WeatherDayForecast = {
  date: string          // ISO date, e.g. "2026-11-27"
  tempMaxC: number
  tempMinC: number
  precipMm: number
  weatherCode: number   // WMO weather interpretation code
  description: string   // human-readable estimate label
}

export type WeatherResult = {
  location: string        // display name from geocoder
  latitude: number
  longitude: number
  currentTempC: number
  currentFeelsLikeC: number
  currentHumidityPct: number
  currentWindKph: number
  currentWeatherCode: number
  currentDescription: string
  forecast: WeatherDayForecast[]  // next 7 days (estimates)
  fetchedAt: string               // ISO timestamp
  dataSource: string
}

// ── WMO weather code → description ──────────────────────────────────────────

function wmoDescription(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 9) return 'Fog'
  if (code <= 19) return 'Drizzle'
  if (code <= 29) return 'Rain'
  if (code <= 39) return 'Snow / sleet'
  if (code <= 49) return 'Fog'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Rain showers'
  if (code <= 94) return 'Thunderstorm'
  return 'Severe thunderstorm'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeString(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ── Geocoding ────────────────────────────────────────────────────────────────

type GeoResult = {
  display: string
  latitude: number
  longitude: number
  countryCode: string
}

async function geocode(location: string): Promise<GeoResult | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', location)
  url.searchParams.set('count', '5')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GrowWise/1.0 (+https://growwise.app)' },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) return null

  const json: unknown = await res.json()
  if (!isRecord(json)) return null

  const results = json.results
  if (!Array.isArray(results) || results.length === 0) return null

  // Pick first result; prefer one with country info
  const r = results[0]
  if (!isRecord(r)) return null

  const name = safeString(r.name)
  const admin1 = safeString(r.admin1)
  const country = safeString(r.country)
  const countryCode = safeString(r.country_code).toUpperCase()
  const latitude = typeof r.latitude === 'number' ? r.latitude : null
  const longitude = typeof r.longitude === 'number' ? r.longitude : null

  if (latitude === null || longitude === null || !name) return null

  const parts = [name, admin1, country].filter(Boolean)
  return {
    display: parts.join(', '),
    latitude,
    longitude,
    countryCode,
  }
}

// ── Forecast ─────────────────────────────────────────────────────────────────

async function fetchForecast(lat: number, lon: number): Promise<{
  currentTempC: number
  currentFeelsLikeC: number
  currentHumidityPct: number
  currentWindKph: number
  currentWeatherCode: number
  forecast: WeatherDayForecast[]
}> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'wind_speed_10m',
    'weather_code',
  ].join(','))
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
  ].join(','))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '7')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GrowWise/1.0 (+https://growwise.app)' },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    throw new Error(`Open-Meteo forecast returned ${res.status}`)
  }

  const json: unknown = await res.json()
  if (!isRecord(json)) throw new Error('Unexpected forecast response shape')

  // Current
  const cur = json.current
  if (!isRecord(cur)) throw new Error('No current weather in response')

  const currentTempC = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : 0
  const currentFeelsLikeC = typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : currentTempC
  const currentHumidityPct = typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : 0
  const currentWindKph = typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : 0
  const currentWeatherCode = typeof cur.weather_code === 'number' ? cur.weather_code : 0

  // Daily forecast
  const daily = json.daily
  if (!isRecord(daily)) throw new Error('No daily forecast in response')

  const dates: string[] = Array.isArray(daily.time) ? (daily.time as string[]) : []
  const maxTemps: number[] = Array.isArray(daily.temperature_2m_max) ? (daily.temperature_2m_max as number[]) : []
  const minTemps: number[] = Array.isArray(daily.temperature_2m_min) ? (daily.temperature_2m_min as number[]) : []
  const precips: number[] = Array.isArray(daily.precipitation_sum) ? (daily.precipitation_sum as number[]) : []
  const codes: number[] = Array.isArray(daily.weather_code) ? (daily.weather_code as number[]) : []

  const forecast: WeatherDayForecast[] = dates.map((date, i) => {
    const code = codes[i] ?? 0
    return {
      date,
      tempMaxC: Math.round((maxTemps[i] ?? 0) * 10) / 10,
      tempMinC: Math.round((minTemps[i] ?? 0) * 10) / 10,
      precipMm: Math.round((precips[i] ?? 0) * 10) / 10,
      weatherCode: code,
      description: wmoDescription(code),
    }
  })

  return {
    currentTempC: Math.round(currentTempC * 10) / 10,
    currentFeelsLikeC: Math.round(currentFeelsLikeC * 10) / 10,
    currentHumidityPct: Math.round(currentHumidityPct),
    currentWindKph: Math.round(currentWindKph * 10) / 10,
    currentWeatherCode,
    forecast,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > 2000) {
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
    }
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const location = safeString(body.location, 150)
  if (!location || location.length < 2) {
    return NextResponse.json(
      { error: 'Provide a location name of at least 2 characters.' },
      { status: 400 }
    )
  }

  // Check cache
  const cacheKey = location.toLowerCase().replace(/\s+/g, ' ')
  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  // Geocode
  let geo: GeoResult | null
  try {
    geo = await geocode(location)
  } catch {
    return NextResponse.json(
      { error: 'Could not reach the geocoding service. Try again later.' },
      { status: 502 }
    )
  }

  if (!geo) {
    return NextResponse.json(
      {
        error: `No location found for "${location}". Try a nearby town, district, or region name.`,
        notFound: true,
      },
      { status: 404 }
    )
  }

  // Fetch forecast
  let weatherData: Awaited<ReturnType<typeof fetchForecast>>
  try {
    weatherData = await fetchForecast(geo.latitude, geo.longitude)
  } catch {
    return NextResponse.json(
      { error: 'Could not reach the weather service. Try again later.' },
      { status: 502 }
    )
  }

  const result: WeatherResult = {
    location: geo.display,
    latitude: geo.latitude,
    longitude: geo.longitude,
    ...weatherData,
    currentDescription: wmoDescription(weatherData.currentWeatherCode),
    fetchedAt: new Date().toISOString(),
    dataSource: 'Open-Meteo (open-meteo.com) — free, no key required',
  }

  // Store in cache
  cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(result)
}
