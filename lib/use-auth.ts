'use client'

/**
 * useAuth — React hook that wraps Supabase Auth state and farmer-profile
 * operations.  Falls back to demo-mode (null session) when Supabase is not
 * configured so the rest of the app keeps working without credentials.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Session, User, AuthError } from '@supabase/supabase-js'
import { getSupabaseBrowserClient, isSupabaseConfigured, type FarmerProfileRow } from './supabase'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthState = {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: FarmerProfileRow | null
  isConfigured: boolean
}

export type SignUpData = {
  email: string
  password: string
  name: string
  region: string
  language: string
}

export type SignInData = {
  email: string
  password: string
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
    user: null,
    profile: null,
    isConfigured: isSupabaseConfigured(),
  })

  // Load profile for a given user id
  const loadProfile = useCallback(
    async (userId: string): Promise<FarmerProfileRow | null> => {
      const client = getSupabaseBrowserClient()
      if (!client) return null
      const { data, error } = await client
        .from('farmer_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (error) {
        // PGRST116 = 0 rows; profile not yet created → not an error
        if (error.code !== 'PGRST116') console.error('[useAuth] loadProfile:', error.message)
        return null
      }
      return data as FarmerProfileRow
    },
    []
  )

  // Subscribe to auth state changes
  useEffect(() => {
    const client = getSupabaseBrowserClient()

    if (!client) {
      setState((s) => ({ ...s, status: 'unauthenticated' }))
      return
    }

    let mounted = true

    client.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      const profile = session ? await loadProfile(session.user.id) : null
      setState({
        status: session ? 'authenticated' : 'unauthenticated',
        session,
        user: session?.user ?? null,
        profile,
        isConfigured: true,
      })
    })

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      // On sign-out, clear everything immediately
      if (event === 'SIGNED_OUT') {
        setState({
          status: 'unauthenticated',
          session: null,
          user: null,
          profile: null,
          isConfigured: true,
        })
        return
      }
      const profile = session ? await loadProfile(session.user.id) : null
      setState({
        status: session ? 'authenticated' : 'unauthenticated',
        session,
        user: session?.user ?? null,
        profile,
        isConfigured: true,
      })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function signUp(data: SignUpData): Promise<{ error: string | null }> {
    const client = getSupabaseBrowserClient()
    if (!client) return { error: null } // demo mode — treat as success

    const { data: authData, error: authError } = await client.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { name: data.name }, // stored in auth.users.raw_user_meta_data
      },
    })
    if (authError) return { error: friendlyAuthError(authError) }

    const userId = authData.user?.id
    if (userId) {
      // Create farmer profile row (ignore conflict — may already exist if re-confirming)
      const profileData = {
        user_id: userId,
        name: data.name,
        region: data.region || null,
        preferred_language: data.language || 'en',
      }
      const { error: profileError } = await client
        .from('farmer_profiles')
        .upsert(profileData, { onConflict: 'user_id' })
      if (profileError) {
        // Log but don't fail — auth succeeded; profile can be created on next sign-in
        console.error('[useAuth] profile upsert after sign-up:', profileError.message)
      }
    }

    return { error: null }
  }

  async function signIn(data: SignInData): Promise<{ error: string | null }> {
    const client = getSupabaseBrowserClient()
    if (!client) return { error: null } // demo mode

    const { error } = await client.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    return { error: error ? friendlyAuthError(error) : null }
  }

  async function signOut(): Promise<void> {
    const client = getSupabaseBrowserClient()
    if (!client) return
    await client.auth.signOut()
  }

  async function upsertProfile(
    updates: Partial<Omit<FarmerProfileRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<{ error: string | null }> {
    const client = getSupabaseBrowserClient()
    if (!client || !state.user) return { error: null }

    const profileData = {
      user_id: state.user.id,
      name: state.profile?.name ?? updates.name ?? '',
      ...updates,
    }
    const { error } = await client
      .from('farmer_profiles')
      .upsert(profileData, { onConflict: 'user_id' })

    if (!error) {
      // Refresh local profile state
      const updated = await loadProfile(state.user.id)
      setState((s) => ({ ...s, profile: updated }))
    }
    return { error: error?.message ?? null }
  }

  return { ...state, signUp, signIn, signOut, upsertProfile }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function friendlyAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase()
  if (msg.includes('invalid login') || msg.includes('invalid credentials'))
    return 'Email or password is incorrect. Please try again.'
  if (msg.includes('email not confirmed'))
    return 'Please check your email and click the confirmation link before signing in.'
  if (msg.includes('already registered') || msg.includes('user already exists'))
    return 'An account with this email already exists. Try signing in instead.'
  if (msg.includes('password'))
    return 'Password must be at least 8 characters.'
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Please wait a moment before trying again.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Could not reach the authentication service. Check your connection.'
  return error.message
}
