import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key && !url.includes('TU-PROYECTO'))

// Solo se usa cuando isConfigured es true (App muestra una pantalla de configuración si no).
export const supabase: SupabaseClient = isConfigured
  ? createClient(url!, key!)
  : (null as unknown as SupabaseClient)

/** URL pública de la app (incluye la subcarpeta en GitHub Pages). */
export const appUrl = () => window.location.origin + import.meta.env.BASE_URL
