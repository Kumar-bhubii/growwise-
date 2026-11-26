/**
 * Diagnostic script — tests the Gemini API key and model.
 * Run with: node scripts/test-gemini.mjs
 * Safe: never prints the key value.
 */
import { GoogleGenAI } from '@google/genai'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read .env.local manually
const envPath = resolve(process.cwd(), '.env.local')
let apiKey = ''
let modelOverride = ''

try {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const [k, ...rest] = line.split('=')
    const v = rest.join('=').trim()
    if (k?.trim() === 'GEMINI_API_KEY') apiKey = v
    if (k?.trim() === 'GEMINI_MODEL') modelOverride = v
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

if (!apiKey) {
  console.error('GEMINI_API_KEY is missing or empty in .env.local')
  process.exit(1)
}

console.log('GEMINI_API_KEY: set ✓ (length:', apiKey.length, ')')
console.log('GEMINI_MODEL override:', modelOverride || '(none)')

const modelsToTry = [
  modelOverride,
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-pro',
].filter(Boolean)

const ai = new GoogleGenAI({ apiKey })

for (const model of modelsToTry) {
  process.stdout.write(`\nTrying model "${model}" ... `)
  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'Reply with just: OK' }] }],
      config: { maxOutputTokens: 10 },
    })
    const reply = result.text?.trim()
    console.log('SUCCESS →', reply)
    console.log('\n✅ Working model:', model)
    process.exit(0)
  } catch (err) {
    console.log('FAILED')
    console.log('   status:', err?.status ?? err?.code ?? 'n/a')
    console.log('   name:  ', err?.name ?? 'n/a')
    console.log('   msg:   ', String(err?.message ?? '').slice(0, 200))
  }
}

console.log('\n❌ All models failed. See errors above.')
