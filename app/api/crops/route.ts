/**
 * /api/crops
 *
 * Server-side crop recommendation route.
 *
 * Data sources used (in order of priority):
 *   1. FAO Crop Calendar API — planting/harvest windows for a country/crop.
 *      https://api-cropcalendar.apps.fao.org/
 *      This provides planting window evidence, NOT suitability claims.
 *   2. A conservative built-in crop–soil–water compatibility table derived
 *      from published agronomic references (CGIAR/FAO crop guides). Used only
 *      to gate "good/caution/avoid" — NOT as a source of fertiliser rates or
 *      yield claims.
 *
 * Gemini is NOT called here. The route returns structured data. The UI
 * sends that data to Gemini only to explain what the numbers mean.
 *
 * Rules enforced in this route:
 *   - Every recommendation is labelled with its evidence source.
 *   - If the FAO calendar has no data for a country, that gap is surfaced.
 *   - Soil thresholds come from the built-in table, not from Gemini.
 *   - No yields, income, or fertiliser rates are returned.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ── In-memory cache (TTL 60 min — FAO data changes infrequently) ─────────────

type CacheEntry<T> = { data: T; expiresAt: number }
const faoCache = new Map<string, CacheEntry<FaoCropEntry[]>>()
const FAO_TTL_MS = 60 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecommendedCrop = {
  name: string
  category: 'good' | 'caution' | 'avoid'
  summary: string
  why: string
  factors: string[]
  caution: string
  guide: string[]
  // Evidence metadata
  evidenceSource: string
  dataGaps: string[]
  // FAO calendar data, if available
  faoPlantingWindow?: string
  faoHarvestWindow?: string
  faoCountry?: string
  faoDataAvailable: boolean
}

export type CropsResult = {
  crops: RecommendedCrop[]
  location: string
  season: string
  dataSourceNote: string
  faoQueried: boolean
  faoCountryCode: string | null
  faoDataAvailable: boolean
  unverifiedRegion: boolean
  fetchedAt: string
}

type FaoCropEntry = {
  cropName: string
  plantingMonths: number[]  // 1-12
  harvestMonths: number[]   // 1-12
  country: string
  countryCode: string
}

// ── Built-in crop catalogue ───────────────────────────────────────────────────
// Source: FAO crop production guidelines, CGIAR crop profiles, agronomic references.
// These are STARTING POINTS only — always verify locally.

type SoilTexture = 'Loamy' | 'Sandy' | 'Clayey' | 'Not sure'
type WaterAccess = 'Rainfed' | 'Irrigation'

type CropProfile = {
  name: string
  // Which soil textures suit this crop (from published profiles)
  soilFit: SoilTexture[]
  // Does it need irrigation, tolerate rainfed, or both?
  waterFit: WaterAccess[]
  // Rough pH range from published crop guides (not exact thresholds)
  phMin: number
  phMax: number
  // General growing guide (steps, not prescriptions)
  guide: string[]
  // General caution statement
  caution: string
}

const CROP_CATALOGUE: CropProfile[] = [
  {
    name: 'Sorghum',
    soilFit: ['Loamy', 'Sandy', 'Clayey', 'Not sure'],
    waterFit: ['Rainfed', 'Irrigation'],
    phMin: 5.5, phMax: 8.5,
    guide: [
      'Prepare a well-drained seedbed; sorghum tolerates moderate drought once established.',
      'Sow at the start of the rains; use locally recommended varieties and confirm timing with an extension officer.',
      'Monitor for pests such as stem borers; ask locally about common threats in your area.',
      'Harvest when grain is hard and moisture content is low; confirm timing with local guidance.',
    ],
    caution: 'Sorghum is drought-tolerant but not immune to prolonged dry spells. Confirm variety choice and planting timing with a local extension officer.',
  },
  {
    name: 'Maize',
    soilFit: ['Loamy', 'Not sure'],
    waterFit: ['Rainfed', 'Irrigation'],
    phMin: 5.8, phMax: 7.0,
    guide: [
      'Deep, well-drained loamy soils give the best results; avoid waterlogging.',
      'Plant at the start of reliable rainfall; seed rate and spacing vary by variety — confirm locally.',
      'Watch for armyworm and stalk borers; ask your extension officer about control options.',
      'Harvest when husks are dry and kernels are hard; dry promptly to reduce aflatoxin risk.',
    ],
    caution: 'Maize needs reliable rainfall or irrigation at tasselling stage. Soil pH outside 5.8–7.0 may limit uptake of key nutrients. Verify locally.',
  },
  {
    name: 'Beans (common)',
    soilFit: ['Loamy', 'Sandy', 'Not sure'],
    waterFit: ['Rainfed', 'Irrigation'],
    phMin: 6.0, phMax: 7.5,
    guide: [
      'Avoid waterlogged or heavy clay soils; beans need good drainage.',
      'Plant early in the rains; spacing and row width depend on the variety — confirm locally.',
      'Watch for bean fly, aphids, and rust; ask your extension officer for locally appropriate treatments.',
      'Harvest when pods are dry and seeds rattle inside; thresh carefully to avoid damage.',
    ],
    caution: 'Common beans are sensitive to water stress and waterlogging. Drainage matters significantly. Verify local planting windows.',
  },
  {
    name: 'Cowpea',
    soilFit: ['Sandy', 'Loamy', 'Not sure'],
    waterFit: ['Rainfed'],
    phMin: 5.5, phMax: 7.0,
    guide: [
      'Cowpea tolerates poor, sandy soils and moderate drought; it also fixes nitrogen.',
      'Plant at the onset of rains; short-season varieties can fit into drier periods.',
      'Monitor for aphids and pod borers; ask locally about prevalent pests.',
      'Harvest pods as they dry; multiple pickings may be possible.',
    ],
    caution: 'Cowpea is adapted to low-input farming but is not drought-proof. Confirm seasonal timing with local advisors.',
  },
  {
    name: 'Sweet potato',
    soilFit: ['Sandy', 'Loamy', 'Not sure'],
    waterFit: ['Rainfed', 'Irrigation'],
    phMin: 5.6, phMax: 6.6,
    guide: [
      'Sandy loam soils with good drainage are preferred; heavy clay reduces root development.',
      'Plant vine cuttings, not seeds; source healthy, virus-free planting material locally.',
      'Requires moderate water — not waterlogged; weed regularly in the first weeks.',
      'Harvest when leaves start to yellow; avoid damaging roots during harvest.',
    ],
    caution: 'Sweet potato can harbour viral diseases if planting material is not clean. Source from reputable local suppliers.',
  },
  {
    name: 'Groundnut',
    soilFit: ['Sandy', 'Loamy', 'Not sure'],
    waterFit: ['Rainfed', 'Irrigation'],
    phMin: 5.9, phMax: 7.0,
    guide: [
      'Light, well-drained sandy loam soils are ideal; pods cannot develop in hard, compacted soils.',
      'Plant at the start of the rains; pegging (pod formation) needs adequate soil moisture.',
      'Watch for leaf spots and rosette virus (transmitted by aphids); ask locally about control.',
      'Harvest before soils become too wet or dry; dry pods carefully to prevent aflatoxin.',
    ],
    caution: 'Groundnut is very susceptible to aflatoxin if improperly dried. Post-harvest handling matters as much as agronomic practice.',
  },
  {
    name: 'Rice',
    soilFit: ['Clayey', 'Loamy', 'Not sure'],
    waterFit: ['Irrigation'],
    phMin: 5.5, phMax: 7.0,
    guide: [
      'Lowland rice needs standing water or reliable irrigation; upland varieties need less but are still water-intensive.',
      'Level fields and prepare seedbeds carefully; transplanting or direct seeding — confirm the method with local experts.',
      'Water management is critical; ask a local extension officer for flood/drain schedules.',
      'Harvest at the right grain moisture; delays cause shattering and losses.',
    ],
    caution: 'Rice requires reliable and substantial water access. Rainfed production is high risk without confirmed supplemental water. Verify local infrastructure.',
  },
  {
    name: 'Cassava',
    soilFit: ['Sandy', 'Loamy', 'Not sure'],
    waterFit: ['Rainfed'],
    phMin: 5.5, phMax: 7.5,
    guide: [
      'Cassava tolerates poor, sandy soils and drought once established; avoid waterlogging.',
      'Plant stem cuttings at the start of the rains; stake on slopes to prevent erosion.',
      'Minimal inputs are needed but weeding in the first months is critical.',
      'Harvest between 8–24 months depending on variety; roots deteriorate quickly after harvest.',
    ],
    caution: 'Cassava can deplete soil nutrients over time. Rotate with legumes where possible. Confirm variety choice with local advisors to manage mosaic virus risk.',
  },
  {
    name: 'Millet (finger)',
    soilFit: ['Sandy', 'Loamy', 'Not sure'],
    waterFit: ['Rainfed'],
    phMin: 5.0, phMax: 7.5,
    guide: [
      'Very drought-tolerant; grows well on marginal soils where other cereals struggle.',
      'Plant at the onset of rains; broadcast or row-planting — confirm with local extension.',
      'Minimal inputs required; weed competition in early stages is the main challenge.',
      'Harvest when grain is fully ripe; thresh carefully.',
    ],
    caution: 'Finger millet is highly nutritious but can be low-yielding. It is a valuable food-security crop. Confirm local market and storage options.',
  },
]

// ── Month helpers ─────────────────────────────────────────────────────────────

function seasonToMonthRange(season: string): number[] {
  const s = season.toLowerCase()
  if (s.includes('long rain') || s.includes('masika') || s.includes('kharif')) return [3, 4, 5, 6, 7]
  if (s.includes('short rain') || s.includes('vuli') || s.includes('rabi')) return [10, 11, 12, 1]
  if (s.includes('summer') || s.includes('wet')) return [5, 6, 7, 8, 9]
  if (s.includes('winter') || s.includes('dry')) return [11, 12, 1, 2, 3]
  if (s.includes('monsoon')) return [6, 7, 8, 9]
  if (s.includes('spring')) return [3, 4, 5]
  // Unknown season — return all months (no season filter)
  return []
}

function monthsOverlap(a: number[], b: number[]): boolean {
  if (a.length === 0 || b.length === 0) return true
  return a.some((m) => b.includes(m))
}

function formatMonthList(months: number[]): string {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return months.map((m) => names[m - 1] ?? '?').join(', ')
}

// ── FAO Crop Calendar fetcher ─────────────────────────────────────────────────

async function fetchFaoCropCalendar(countryCode: string): Promise<FaoCropEntry[]> {
  const cacheKey = countryCode.toUpperCase()
  const cached = faoCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  try {
    // FAO Crop Calendar API — returns crop calendar events for a country
    const url = `https://api-cropcalendar.apps.fao.org/api/cropCalendar/all?country=${encodeURIComponent(cacheKey)}&format=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GrowWise/1.0 (+https://growwise.app)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      faoCache.set(cacheKey, { data: [], expiresAt: Date.now() + FAO_TTL_MS })
      return []
    }

    const json: unknown = await res.json()

    // The FAO API returns an array of crop calendar objects
    if (!Array.isArray(json)) {
      faoCache.set(cacheKey, { data: [], expiresAt: Date.now() + FAO_TTL_MS })
      return []
    }

    const entries: FaoCropEntry[] = []
    for (const item of json) {
      if (typeof item !== 'object' || item === null) continue
      const r = item as Record<string, unknown>

      const cropName = typeof r.crop === 'string' ? r.crop.trim() : ''
      const countryName = typeof r.country === 'string' ? r.country.trim() : ''
      const countryCodeVal = typeof r.countryCode === 'string' ? r.countryCode.toUpperCase() : cacheKey

      // Parse planting months — FAO uses various field names
      const plantStart = typeof r.plantingStart === 'number' ? r.plantingStart : null
      const plantEnd = typeof r.plantingEnd === 'number' ? r.plantingEnd : null
      const harvestStart = typeof r.harvestStart === 'number' ? r.harvestStart : null
      const harvestEnd = typeof r.harvestEnd === 'number' ? r.harvestEnd : null

      if (!cropName || plantStart === null) continue

      // Build month arrays (1-based)
      const plantingMonths: number[] = []
      if (plantStart !== null && plantEnd !== null) {
        let m = plantStart
        while (true) {
          plantingMonths.push(m)
          if (m === plantEnd) break
          m = m % 12 + 1
          if (plantingMonths.length > 12) break
        }
      }

      const harvestMonths: number[] = []
      if (harvestStart !== null && harvestEnd !== null) {
        let m = harvestStart
        while (true) {
          harvestMonths.push(m)
          if (m === harvestEnd) break
          m = m % 12 + 1
          if (harvestMonths.length > 12) break
        }
      }

      entries.push({ cropName, plantingMonths, harvestMonths, country: countryName, countryCode: countryCodeVal })
    }

    faoCache.set(cacheKey, { data: entries, expiresAt: Date.now() + FAO_TTL_MS })
    return entries
  } catch {
    // Network error — return empty; mark as unavailable
    faoCache.set(cacheKey, { data: [], expiresAt: Date.now() + 5 * 60 * 1000 })
    return []
  }
}

// ── Match FAO crop names to our catalogue ────────────────────────────────────

function matchFaoName(catalogueName: string, faoEntries: FaoCropEntry[]): FaoCropEntry | null {
  const lower = catalogueName.toLowerCase()
  // Simple substring matching — FAO names vary by region
  for (const entry of faoEntries) {
    const faoLower = entry.cropName.toLowerCase()
    if (faoLower.includes(lower) || lower.includes(faoLower)) return entry
    // Extra aliases
    if (lower === 'beans (common)' && (faoLower.includes('bean') || faoLower.includes('phaseolus'))) return entry
    if (lower === 'millet (finger)' && faoLower.includes('millet')) return entry
    if (lower === 'groundnut' && (faoLower.includes('groundnut') || faoLower.includes('peanut'))) return entry
    if (lower === 'maize' && (faoLower.includes('maize') || faoLower.includes('corn'))) return entry
  }
  return null
}

// ── Recommendation engine ─────────────────────────────────────────────────────

function buildRecommendations(params: {
  soilTexture: SoilTexture
  water: WaterAccess
  phValue: number | null
  season: string
  faoEntries: FaoCropEntry[]
  faoDataAvailable: boolean
  unverifiedRegion: boolean
}): RecommendedCrop[] {
  const { soilTexture, water, phValue, season, faoEntries, faoDataAvailable, unverifiedRegion } = params
  const seasonMonths = seasonToMonthRange(season)

  return CROP_CATALOGUE.map((crop): RecommendedCrop => {
    const factors: string[] = []
    const dataGaps: string[] = []
    let matchScore = 0  // higher = better fit based on inputs
    let soilOk = false
    let waterOk = false
    let phOk = false
    let seasonOk = false

    // Soil fit
    if (soilTexture === 'Not sure') {
      factors.push('Soil texture: not entered')
      dataGaps.push('Soil texture not entered — visual estimate only')
    } else if (crop.soilFit.includes(soilTexture)) {
      soilOk = true
      matchScore += 2
      factors.push(`Soil texture: ${soilTexture} (compatible)`)
    } else {
      factors.push(`Soil texture: ${soilTexture} (may not suit this crop)`)
      dataGaps.push(`Soil texture "${soilTexture}" may not be ideal for ${crop.name} — verify locally`)
    }

    // Water fit
    if (crop.waterFit.includes(water)) {
      waterOk = true
      matchScore += 3
      factors.push(`Water access: ${water} (matches crop requirement)`)
    } else {
      factors.push(`Water access: ${water} (crop typically needs more water)`)
      dataGaps.push(`${crop.name} typically needs more water than "${water}" — verify local options`)
    }

    // pH fit (only if soil report was used)
    if (phValue !== null) {
      if (phValue >= crop.phMin && phValue <= crop.phMax) {
        phOk = true
        matchScore += 1
        factors.push(`Soil pH: ${phValue} (within ${crop.phMin}–${crop.phMax} published range)`)
      } else {
        factors.push(`Soil pH: ${phValue} (outside published range ${crop.phMin}–${crop.phMax})`)
        dataGaps.push(`pH ${phValue} is outside the published suitable range for ${crop.name} — confirm with a soil specialist`)
      }
    } else {
      dataGaps.push('Soil pH not entered — no pH suitability check possible')
    }

    // FAO season fit
    const faoMatch = matchFaoName(crop.name, faoEntries)
    if (faoMatch && faoMatch.plantingMonths.length > 0) {
      const plantingOverlap = monthsOverlap(seasonMonths, faoMatch.plantingMonths)
      if (plantingOverlap) {
        seasonOk = true
        matchScore += 2
        factors.push(`FAO calendar: planting window (${formatMonthList(faoMatch.plantingMonths)}) overlaps with selected season`)
      } else {
        factors.push(`FAO calendar: planting window (${formatMonthList(faoMatch.plantingMonths)}) does not overlap with selected season`)
        dataGaps.push(`FAO planting window for ${crop.name} in this country may not match your selected season — verify locally`)
      }
    } else if (faoDataAvailable) {
      dataGaps.push(`FAO Crop Calendar has no planting data for ${crop.name} in this country`)
    } else {
      dataGaps.push('FAO Crop Calendar data unavailable for this region — planting window not verified')
    }

    // Determine category
    let category: 'good' | 'caution' | 'avoid'
    // Water is the highest-weight factor (must match for 'good')
    if (waterOk && matchScore >= 5) {
      category = 'good'
    } else if (waterOk && matchScore >= 3) {
      category = 'caution'
    } else if (!waterOk) {
      category = 'avoid'
    } else {
      category = 'caution'
    }

    // Downgrade if region is unverified
    if (unverifiedRegion && category === 'good') {
      category = 'caution'
    }

    // Downgrade if no FAO data available at all and category is 'good'
    if (!faoDataAvailable && category === 'good') {
      category = 'caution'
    }

    // Build summary
    const summaryBase = category === 'good'
      ? `Appears compatible with your farm profile based on entered data.`
      : category === 'caution'
      ? `May suit your farm, but some inputs don\u2019t fully match — check locally.`
      : `Likely not suitable based on your current inputs.`

    const evidenceSource = faoMatch
      ? `FAO Crop Calendar (${faoMatch.country || 'this country'}) + published agronomic references`
      : faoDataAvailable
      ? `Published agronomic references (FAO Crop Calendar has no data for ${crop.name} in this country)`
      : `Published agronomic references only (FAO Crop Calendar data unavailable for this region)`

    // Why explanation
    const faoNote = faoMatch
      ? ` FAO Crop Calendar lists a planting window of ${formatMonthList(faoMatch.plantingMonths)} for ${faoMatch.country}.`
      : faoDataAvailable
      ? ` FAO Crop Calendar did not return planting data for ${crop.name} in this country.`
      : ' FAO Crop Calendar data was not available for this region.'

    const why = `Category is based on soil texture, water access${phValue !== null ? ', soil pH' : ''}, and season match against published crop profiles.${faoNote} This is a starting point — verify suitability with a local extension officer.`

    const faoPlantingWindow = faoMatch && faoMatch.plantingMonths.length > 0
      ? formatMonthList(faoMatch.plantingMonths)
      : undefined
    const faoHarvestWindow = faoMatch && faoMatch.harvestMonths.length > 0
      ? formatMonthList(faoMatch.harvestMonths)
      : undefined

    if (unverifiedRegion) {
      dataGaps.push('Region not found in FAO database — recommendations are less certain')
    }

    return {
      name: crop.name,
      category,
      summary: summaryBase,
      why,
      factors,
      caution: crop.caution,
      guide: crop.guide,
      evidenceSource,
      dataGaps,
      faoPlantingWindow,
      faoHarvestWindow,
      faoCountry: faoMatch?.country,
      faoDataAvailable,
    }
  }).sort((a, b) => {
    const order = { good: 0, caution: 1, avoid: 2 }
    return order[a.category] - order[b.category]
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Country code from geocoder → FAO uses ISO 3166-1 alpha-2 (usually same)
function normaliseCountryCode(code: string): string {
  return code.toUpperCase().trim().slice(0, 2)
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > 4000) {
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
    }
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Extract farm profile fields
  const soilMode = typeof body.soilMode === 'string' ? body.soilMode : 'visual'
  const soilTexture = (['Loamy', 'Sandy', 'Clayey', 'Not sure'].includes(String(body.texture ?? 'Not sure'))
    ? String(body.texture)
    : 'Not sure') as SoilTexture
  const water = (['Rainfed', 'Irrigation'].includes(String(body.water ?? 'Rainfed'))
    ? String(body.water)
    : 'Rainfed') as WaterAccess
  const season = typeof body.season === 'string' ? body.season.trim() : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  const countryCodeRaw = typeof body.countryCode === 'string' ? body.countryCode : ''

  // Parse pH only from soil report
  let phValue: number | null = null
  if (soilMode === 'report') {
    const phRaw = parseFloat(String(body.ph ?? ''))
    if (Number.isFinite(phRaw) && phRaw >= 0 && phRaw <= 14) phValue = phRaw
  }

  // Country code for FAO
  const countryCode = countryCodeRaw ? normaliseCountryCode(countryCodeRaw) : ''

  // Fetch FAO data if we have a country code
  let faoEntries: FaoCropEntry[] = []
  let faoQueried = false
  let faoDataAvailable = false
  let faoCountryCode: string | null = null

  if (countryCode.length === 2) {
    faoQueried = true
    faoCountryCode = countryCode
    faoEntries = await fetchFaoCropCalendar(countryCode)
    faoDataAvailable = faoEntries.length > 0
  }

  const unverifiedRegion = !countryCode || !faoDataAvailable

  const crops = buildRecommendations({
    soilTexture,
    water,
    phValue,
    season,
    faoEntries,
    faoDataAvailable,
    unverifiedRegion,
  })

  const result: CropsResult = {
    crops,
    location,
    season,
    dataSourceNote: faoDataAvailable
      ? `Crop windows from FAO Crop Calendar for ${faoCountryCode}. Soil/water compatibility from published agronomic references. Verify all suggestions with a local agricultural extension officer.`
      : `No FAO Crop Calendar data available for this region. Suggestions are based on published agronomic references only and are presented as examples. Verify with a local agricultural extension officer.`,
    faoQueried,
    faoCountryCode,
    faoDataAvailable,
    unverifiedRegion,
    fetchedAt: new Date().toISOString(),
  }

  return NextResponse.json(result)
}
