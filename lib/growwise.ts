export type SoilMode = 'report' | 'visual'
export type View = 'welcome' | 'register' | 'setup' | 'dashboard'

export type FarmProfile = {
  name: string
  location: string
  soilMode: SoilMode
  nitrogen: string
  phosphorus: string
  potassium: string
  ph: string
  texture: string
  soilColor: string
  moisture: string
  season: string
  water: string
  waterSource: string
  budget: string
  fertilizer: string
}

export type Crop = {
  name: string
  category: 'good' | 'caution' | 'avoid'
  summary: string
  why: string
  factors: string[]
  caution: string
  guide: string[]
  // Evidence metadata (populated by /api/crops; absent in demo/fallback)
  evidenceSource?: string
  dataGaps?: string[]
  faoPlantingWindow?: string
  faoHarvestWindow?: string
  faoCountry?: string
  faoDataAvailable?: boolean
}

// ── Weather types (mirrors /api/weather response) ─────────────────────────────

export type WeatherDayForecast = {
  date: string
  tempMaxC: number
  tempMinC: number
  precipMm: number
  weatherCode: number
  description: string
}

export type WeatherData = {
  location: string
  latitude: number
  longitude: number
  currentTempC: number
  currentFeelsLikeC: number
  currentHumidityPct: number
  currentWindKph: number
  currentWeatherCode: number
  currentDescription: string
  forecast: WeatherDayForecast[]
  fetchedAt: string
  dataSource: string
}

export type WeatherState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: WeatherData }
  | { status: 'error'; message: string; notFound?: boolean }

// ── Crop recommendation state (mirrors /api/crops response) ───────────────────

export type CropsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; crops: Crop[]; dataSourceNote: string; faoDataAvailable: boolean; unverifiedRegion: boolean; fetchedAt: string }
  | { status: 'error'; message: string }

// ── Initial / fallback data ───────────────────────────────────────────────────

export const initialProfile: FarmProfile = {
  name: 'Amina',
  location: 'Kisumu County',
  soilMode: 'visual',
  nitrogen: '',
  phosphorus: '',
  potassium: '',
  ph: '',
  texture: 'Loamy',
  soilColor: 'Dark brown',
  moisture: 'Somewhat moist',
  season: 'Long rains',
  water: 'Rainfed',
  waterSource: '',
  budget: 'Careful budget',
  fertilizer: 'Limited access',
}

/**
 * Fallback demo crops — shown only when the API is unavailable.
 * These are clearly labelled as examples throughout the UI.
 */
export const demoCrops: Crop[] = [
  {
    name: 'Sorghum',
    category: 'good',
    summary: 'A resilient option to explore for a rainfed season.',
    why: 'This sample suggestion emphasises a rainfed setup and a warm-season planting window. It is an illustration of how the app could explain a match, not a locally verified recommendation.',
    factors: ['Rainfed water access', 'Season selection', 'Visual soil estimate'],
    caution: 'Check local varieties, recent rainfall outlook, and advice from an extension officer before planting.',
    guide: [
      'Prepare a level, well-drained seedbed and clear competing growth.',
      'Choose a locally recommended variety and confirm planting timing with an extension officer.',
      'Monitor soil moisture and crop condition; adapt care to rainfall and field conditions.',
      'Plan harvest timing with local guidance and observe crop maturity in the field.',
    ],
    evidenceSource: 'Demo example — not from live data sources',
    dataGaps: ['This is a fixed demo crop. No live data was used.'],
    faoDataAvailable: false,
  },
  {
    name: 'Beans',
    category: 'caution',
    summary: 'Worth discussing locally; rainfall and drainage may matter.',
    why: 'This sample option is shown with caution because the setup uses estimated soil information and weather is unavailable. It demonstrates a cautious tier rather than asserting suitability.',
    factors: ['Soil estimate is not lab-tested', 'Rainfall is not connected', 'Water access'],
    caution: 'Ask a local expert about suitable varieties, drainage, and planting window for your area.',
    guide: [
      'Prepare a fine, well-drained bed and remove weeds before planting.',
      'Select seed suited to your region and confirm the right planting window locally.',
      'Keep an eye on drainage and changing weather; avoid assumptions from this demo.',
      'Confirm local harvest indicators and post-harvest handling practices.',
    ],
    evidenceSource: 'Demo example — not from live data sources',
    dataGaps: ['This is a fixed demo crop. No live data was used.'],
    faoDataAvailable: false,
  },
  {
    name: 'Rice',
    category: 'avoid',
    summary: 'Not prioritized in this demo without confirmed water access.',
    why: 'The sample profile is marked rainfed and does not include verified irrigation or local water availability. The prototype therefore places this crop in the lowest-priority group for demonstration only.',
    factors: ['Water access entered as rainfed', 'No live weather data', 'Local field conditions unknown'],
    caution: 'This is not a crop exclusion. Confirm local water, land, and production practices with an agricultural expert.',
    guide: [
      'Discuss field suitability and water availability with a local agricultural expert.',
      'Use only local, region-specific planting guidance and recommended seed.',
      'Follow locally verified water management guidance; this prototype cannot advise on it.',
      'Confirm harvest planning and post-harvest requirements with local support.',
    ],
    evidenceSource: 'Demo example — not from live data sources',
    dataGaps: ['This is a fixed demo crop. No live data was used.'],
    faoDataAvailable: false,
  },
]

export const categoryLabels = {
  good: 'Good potential',
  caution: 'Consider with caution',
  avoid: 'Not a good fit based on entered information',
} as const
