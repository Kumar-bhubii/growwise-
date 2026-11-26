'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowRight, ChevronDown, CircleHelp, Globe2, Leaf, Menu, MessageCircle, ShieldCheck, Sprout, X, Sun, MapPin, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GrowWiseWizard } from '@/components/growwise-wizard'
import { CropDashboard, CropDetail } from '@/components/crop-dashboard'
import { AdvisorPanel } from '@/components/advisor-panel'
import { demoCrops, initialProfile, type Crop, type FarmProfile, type View } from '@/lib/growwise'
import { LocaleProvider, TranslateTree, languageNames, translateText, type Language } from '@/lib/i18n'
import { VoiceInput } from '@/components/voice-input'
import { useAuth } from '@/lib/use-auth'
import { isSupabaseConfigured } from '@/lib/supabase'

export function GrowWiseApp() {
  const [view, setView] = useState<View>('welcome')
  const [profile, setProfile] = useState<FarmProfile>(initialProfile)
  const [detail, setDetail] = useState<Crop | null>(null)
  const [assistant, setAssistant] = useState(false)
  const [assistantCrop, setAssistantCrop] = useState<Crop | null>(null)
  const [language, setLanguage] = useState<Language>('en')
  const [accountName, setAccountName] = useState('')
  const [accountContact, setAccountContact] = useState('')
  const [accountRegion, setAccountRegion] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [accountFeedback, setAccountFeedback] = useState('')
  const [authMode, setAuthMode] = useState<'create' | 'signin'>('create')
  const [accountError, setAccountError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const auth = useAuth()
  const supabaseReady = isSupabaseConfigured()

  // If the user is already signed in and lands on the register page, send them to setup
  useEffect(() => {
    if (auth.status === 'authenticated' && view === 'register') {
      setView('setup')
    }
  }, [auth.status, view])

  // Sync profile from Supabase when user signs in
  useEffect(() => {
    if (auth.status === 'authenticated' && auth.profile) {
      setProfile((prev) => ({
        ...prev,
        name: auth.profile!.name || prev.name,
        location: auth.profile!.region || prev.location,
        season: auth.profile!.season || prev.season,
        water: auth.profile!.water_access || prev.water,
        budget: auth.profile!.budget_preference || prev.budget,
        fertilizer: auth.profile!.fertilizer_access || prev.fertilizer,
        soilMode: (auth.profile!.soil_input_preference as 'report' | 'visual') || prev.soilMode,
      }))
    }
  }, [auth.status, auth.profile])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = translateText('GrowWise — Smart Crop Advisory', language)
  }, [language])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setDetail(null); setAssistant(false); setMobileMenu(false) }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  function enterDemo() {
    setProfile({ ...initialProfile, name: 'Amina' })
    setView('setup')
  }

  function editInputs() { setView('setup') }
  function openAssistant(crop: Crop | null = null) { setAssistantCrop(crop); setAssistant(true) }

  async function handleSignOut() {
    await auth.signOut()
    setProfile(initialProfile)
    setView('welcome')
    setMobileMenu(false)
  }

  async function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    const contact = String(data.get('contact') || '').trim()
    const password = String(data.get('password') || '')
    const region = String(data.get('region') || '').trim()

    // Basic validation — only email allowed when Supabase is configured
    const isEmail = contact.includes('@') && contact.split('@').length === 2 && contact.split('@')[1].includes('.')
    const isPhone = Array.from(contact).every((c) => '0123456789+(). -'.includes(c)) && contact.replace(/\D/g, '').length >= 7
    const contactIsValid = supabaseReady ? isEmail : (isEmail || isPhone)

    if (!contactIsValid || password.length < 8 || (authMode === 'create' && (!name || !region))) {
      setAccountError(
        supabaseReady
          ? 'Enter a valid email address, a password of at least 8 characters, and complete all required fields.'
          : 'Enter a valid email or phone, a password of at least 8 characters, and complete all required fields.'
      )
      return
    }

    setAccountError('')

    // ── Demo mode (no Supabase) ──────────────────────────────────────────────
    if (!supabaseReady) {
      if (authMode === 'create') setProfile({ ...initialProfile, name, location: region })
      setAccountFeedback(
        authMode === 'signin'
          ? 'Sign-in is not connected in this prototype. No account was accessed. Continue in demo mode to explore the app.'
          : 'This is a front-end prototype. No account was created or stored. Continue to farm setup in demo mode.'
      )
      return
    }

    // ── Live Supabase auth ───────────────────────────────────────────────────
    setAuthLoading(true)
    try {
      if (authMode === 'create') {
        const { error } = await auth.signUp({
          email: contact,
          password,
          name,
          region,
          language,
        })
        if (error) {
          setAccountError(error)
          return
        }
        // Supabase sends a confirmation email by default
        setAccountFeedback(
          'Account created! Check your email for a confirmation link, then sign in. You can also continue in demo mode while you wait.'
        )
      } else {
        const { error } = await auth.signIn({ email: contact, password })
        if (error) {
          setAccountError(error)
          return
        }
        // onAuthStateChange will update auth.status; redirect to setup
        setAccountFeedback('')
        setView('setup')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  // Show a loading shimmer while auth initialises (only when Supabase is configured)
  const authInitialising = supabaseReady && auth.status === 'loading'

  return (
    <LocaleProvider language={language}>
      <TranslateTree>
        <div className="app-frame">
          <header className="topbar">
            <button className="brand" onClick={() => setView('welcome')} aria-label="GrowWise home">
              <span className="brand-mark"><Sprout aria-hidden="true" /></span>
              <span>grow<span>wise</span></span>
              <small>FIELD GUIDE</small>
            </button>

            {view === 'dashboard' && (
              <nav className="desktop-nav" aria-label="Main navigation">
                <button className="nav-item active" onClick={() => setView('dashboard')}><Sun aria-hidden="true" /> Dashboard</button>
                <button className="nav-item" onClick={editInputs}><Sprout aria-hidden="true" /> My farm</button>
                <button className="nav-item" onClick={() => setDetail(demoCrops[0])}><Leaf aria-hidden="true" /> Crop guide</button>
                <button className="nav-item" onClick={() => openAssistant()}><CircleHelp aria-hidden="true" /> Help</button>
              </nav>
            )}

            <div className="topbar-tools">
              <label className="language-select">
                <Globe2 aria-hidden="true" />
                <span className="sr-only">Language</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label="Choose language">
                  {(Object.keys(languageNames) as Language[]).map((code) => (
                    <option key={code} value={code}>{languageNames[code]}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>

              {view === 'welcome' && (
                <button className="top-signin" onClick={() => { setAuthMode('signin'); setAccountFeedback(''); setView('register') }}>Sign in</button>
              )}

              {view === 'dashboard' && (
                <div className="profile-menu">
                  <span className="profile-avatar">{(profile.name || 'F').slice(0, 1).toUpperCase()}</span>
                  <span className="profile-name">
                    {profile.name ? <span data-no-translate="true">{profile.name}</span> : 'Farmer'}
                    <small>{auth.status === 'authenticated' ? auth.user?.email ?? 'Signed in' : 'Demo profile'}</small>
                  </span>
                  <ChevronDown aria-hidden="true" />
                </div>
              )}

              {view === 'dashboard' && auth.status === 'authenticated' && (
                <button className="top-signin" onClick={handleSignOut} title="Sign out" style={{ display: 'flex', alignItems: 'center', gap: '0.3em' }}>
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              )}

              {view === 'dashboard' && (
                <button className="menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label={mobileMenu ? 'Close menu' : 'Open menu'}>
                  {mobileMenu ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                </button>
              )}
            </div>
          </header>

          {mobileMenu && (
            <nav className="mobile-menu" aria-label="Mobile navigation">
              <button onClick={() => { setView('dashboard'); setMobileMenu(false) }}><Sun aria-hidden="true" /> Dashboard</button>
              <button onClick={() => { editInputs(); setMobileMenu(false) }}><Sprout aria-hidden="true" /> My farm</button>
              <button onClick={() => { setDetail(demoCrops[0]); setMobileMenu(false) }}><Leaf aria-hidden="true" /> Crop guide</button>
              <button onClick={() => { openAssistant(); setMobileMenu(false) }}><CircleHelp aria-hidden="true" /> Help</button>
              {auth.status === 'authenticated' && (
                <button onClick={handleSignOut}><LogOut aria-hidden="true" /> Sign out</button>
              )}
            </nav>
          )}

          {/* ── Welcome ─────────────────────────────────────────────────────── */}
          {view === 'welcome' && (
            <main className="welcome-main">
              <section className="hero-section">
                <div className="hero-copy">
                  <span className="eyebrow hero-eyebrow"><span className="eyebrow-dot" /> A LITTLE MORE CERTAINTY, SEASON BY SEASON</span>
                  <h1>Better choices<br />start <em>with your soil.</em></h1>
                  <p className="hero-description">A practical crop planning companion for small-scale farmers. Explore options using the details you know about your farm.</p>
                  <div className="hero-ctas">
                    <Button className="primary-button hero-primary" size="lg" onClick={enterDemo}>Try the demo <ArrowRight data-icon="inline-end" /></Button>
                    <button className="hero-secondary" onClick={() => { setAuthMode('create'); setAccountFeedback(''); setView('register') }}>Create an account <ArrowRight aria-hidden="true" /></button>
                  </div>
                  <div className="hero-reassurance">
                    <span><ShieldCheck aria-hidden="true" /> Demo details stay in this session</span>
                    <i /> <span>No account needed to explore</span>
                  </div>
                </div>
                <div className="hero-visual">
                  <Image src="/growwise-hero.png" alt="A farmer checking young green crops in a sunlit field" fill priority sizes="(max-width: 800px) 100vw, 55vw" className="hero-image" />
                  <div className="hero-image-shade" />
                  <div className="floating-note">
                    <span className="floating-note-icon"><Leaf aria-hidden="true" /></span>
                    <span><strong>Advice that starts with you</strong><small>Your land. Your season. Your decisions.</small></span>
                  </div>
                  <div className="hero-image-caption"><span>GROW WITH WHAT YOU KNOW</span><small>Local knowledge matters most.</small></div>
                  <span className="hero-sun" aria-hidden="true"><Sun /></span>
                </div>
              </section>

              <section className="welcome-features">
                <div><span className="feature-icon"><Sprout aria-hidden="true" /></span><strong>Start with your soil</strong><p>Use a soil report or a simple visual estimate.</p></div>
                <div><span className="feature-icon"><MapPin aria-hidden="true" /></span><strong>Grounded in your farm</strong><p>Bring in your region, season, and water access.</p></div>
                <div><span className="feature-icon"><MessageCircle aria-hidden="true" /></span><strong>Understand every option</strong><p>See what shaped a suggestion and what&apos;s still unknown.</p></div>
              </section>

              <section className="welcome-note">
                <span><CircleHelp aria-hidden="true" /></span>
                <p><strong>A decision-support tool, not a promise.</strong> Recommendations are for exploration. Weather and local agronomic services require a Gemini API key.</p>
                <button onClick={() => setView('register')}>Create account <ArrowRight aria-hidden="true" /></button>
              </section>

              <footer className="welcome-footer">
                <span>© 2026 GrowWise · A prototype for better farm decisions</span>
                <button onClick={() => openAssistant()}>Need help? <ArrowRight aria-hidden="true" /></button>
              </footer>
            </main>
          )}

          {/* ── Register / Sign-in ───────────────────────────────────────────── */}
          {view === 'register' && (
            <main className="register-page">
              <button className="text-button back-welcome" onClick={() => { setView('welcome'); setAccountFeedback('') }}>← Back to welcome</button>
              <section className="register-card">
                <div className="register-illustration">
                  <div className="register-icon"><Sprout aria-hidden="true" /></div>
                  <h2>Welcome to a more thoughtful growing season.</h2>
                  <p>{supabaseReady ? 'Create a secure account to save your farm profile.' : 'Create a local prototype profile, or skip ahead and explore the demo.'}</p>
                  <div className="register-sun"><Sun aria-hidden="true" /></div>
                  <div className="register-terrain" />
                </div>

                <div className="register-form-wrap">
                  <div className="eyebrow">YOUR GROWWISE PROFILE</div>
                  <h1>
                    {accountFeedback ? 'Almost there' : authMode === 'create' ? 'Create your account' : 'Sign in'}
                  </h1>
                  <p>
                    {accountFeedback ||
                      (supabaseReady
                        ? authMode === 'create'
                          ? 'Your account is secured with Supabase Auth — passwords are never stored in our database.'
                          : 'Sign in with your email and password.'
                        : authMode === 'create'
                          ? 'A few details to make your experience feel like yours.'
                          : 'Sign-in is a visual prototype and is not connected to an account.')}
                  </p>

                  {!accountFeedback ? (
                    <form onSubmit={submitAccount} className="register-form" noValidate>
                      {authMode === 'create' && (
                        <label htmlFor="name">
                          Your name
                          <VoiceInput id="name" name="name" placeholder="e.g. Amina" autoComplete="name" required value={accountName} onValueChange={setAccountName} />
                        </label>
                      )}
                      <label htmlFor="contact">
                        Email{!supabaseReady && ' or phone'}
                        <VoiceInput id="contact" name="contact" placeholder="you@example.com" autoComplete="email" required value={accountContact} onValueChange={setAccountContact} />
                      </label>
                      <label htmlFor="password">
                        Password <span>8+ characters</span>
                        <input id="password" name="password" className="text-input" type="password" placeholder={authMode === 'create' ? 'Create a password' : 'Enter your password'} autoComplete={authMode === 'create' ? 'new-password' : 'current-password'} required minLength={8} />
                      </label>
                      {authMode === 'create' && (
                        <div className="register-row">
                          <label htmlFor="preferred-language">
                            Preferred language
                            <select id="preferred-language" name="language" className="text-input" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                              {(Object.keys(languageNames) as Language[]).map((code) => (
                                <option key={code} value={code}>{languageNames[code]}</option>
                              ))}
                            </select>
                          </label>
                          <label htmlFor="region">
                            District or region
                            <VoiceInput id="region" name="region" placeholder="e.g. Kisumu" required value={accountRegion} onValueChange={setAccountRegion} />
                          </label>
                        </div>
                      )}

                      {accountError && <p className="form-error" role="alert">{accountError}</p>}

                      {supabaseReady && authInitialising && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5em', opacity: 0.6, fontSize: '0.875em' }}>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking session…
                        </p>
                      )}

                      <Button className="primary-button register-submit" type="submit" size="lg" disabled={authLoading || authInitialising}>
                        {authLoading
                          ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" /> {authMode === 'create' ? 'Creating account…' : 'Signing in…'}</>
                          : <>{authMode === 'create' ? 'Create profile' : 'Sign in'} <ArrowRight data-icon="inline-end" /></>}
                      </Button>

                      {authMode === 'create' && (
                        <>
                          <div className="register-separator"><span /> or <span /></div>
                          <Button variant="outline" type="button" size="lg" className="demo-register" onClick={enterDemo}>
                            Continue in demo mode
                          </Button>
                          <small className="prototype-notice">
                            <ShieldCheck aria-hidden="true" />
                            {supabaseReady
                              ? ' Passwords are managed securely by Supabase Auth and never stored in our tables.'
                              : ' Prototype only. This form does not create or securely store accounts.'}
                          </small>
                        </>
                      )}

                      <button type="button" className="auth-switch" onClick={() => { setAuthMode(authMode === 'create' ? 'signin' : 'create'); setAccountError('') }}>
                        {authMode === 'create' ? 'Already have an account? Sign in' : 'New to GrowWise? Create an account'}
                      </button>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <Button className="primary-button" size="lg" onClick={() => { setAccountFeedback(''); setView('setup') }}>
                        Continue in demo mode <ArrowRight data-icon="inline-end" />
                      </Button>
                      {supabaseReady && authMode === 'create' && (
                        <Button variant="outline" size="lg" onClick={() => { setAccountFeedback(''); setAuthMode('signin') }}>
                          Back to sign in
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </main>
          )}

          {view === 'setup' && (
            <GrowWiseWizard
              profile={profile}
              onChange={setProfile}
              onBack={() => setView('welcome')}
              onComplete={async () => {
                // Persist farm profile to Supabase if signed in
                if (auth.status === 'authenticated') {
                  const { error } = await auth.upsertProfile({
                    name: profile.name,
                    region: profile.location || null,
                    preferred_language: language,
                    soil_input_preference: profile.soilMode,
                    season: profile.season || null,
                    water_access: profile.water || null,
                    budget_preference: profile.budget || null,
                    fertilizer_access: profile.fertilizer || null,
                  })
                  if (error) {
                    // Return error to wizard so it can show inline feedback
                    return { error }
                  }
                }
                setView('dashboard')
                return { error: null }
              }}
            />
          )}

          {view === 'dashboard' && (
            <CropDashboard
              profile={profile}
              crops={demoCrops}
              onEdit={editInputs}
              onStartOver={() => { setProfile(initialProfile); setView('welcome') }}
              onDetails={setDetail}
              onAsk={(crop) => openAssistant(crop)}
            />
          )}

          {detail && (
            <CropDetail
              crop={detail}
              profile={profile}
              onClose={() => setDetail(null)}
              onAsk={() => { setAssistantCrop(detail); setAssistant(true); setDetail(null) }}
            />
          )}

          {assistant && (
            <AdvisorPanel profile={profile} crop={assistantCrop} onClose={() => setAssistant(false)} />
          )}

          {view !== 'welcome' && (
            <button className="floating-assistant" onClick={() => openAssistant()} aria-label="Open GrowWise assistant">
              <MessageCircle aria-hidden="true" /><span>Ask GrowWise</span>
            </button>
          )}

          {view === 'dashboard' && (
            <nav className="mobile-bottom-nav" aria-label="Quick navigation">
              <button className="active" onClick={() => setView('dashboard')}><Sun aria-hidden="true" /><span>Home</span></button>
              <button onClick={editInputs}><Sprout aria-hidden="true" /><span>My farm</span></button>
              <button onClick={() => setDetail(demoCrops[0])}><Leaf aria-hidden="true" /><span>Crop guide</span></button>
              <button onClick={() => openAssistant()}><MessageCircle aria-hidden="true" /><span>Help</span></button>
            </nav>
          )}
        </div>
      </TranslateTree>
    </LocaleProvider>
  )
}
