/** Quien administra la app (resetea contraseñas desde Supabase). Se puede cambiar con VITE_ADMIN_NAME. */
export const ADMIN_NAME = (import.meta.env.VITE_ADMIN_NAME as string | undefined) || 'Elías'
