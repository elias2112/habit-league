// Traduce errores comunes de Supabase/Postgres a mensajes en español.
export function errorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string } | null
  const msg = err?.message ?? String(e)
  if (err?.code === '23505' || /duplicate key/i.test(msg)) {
    if (/username/i.test(msg)) return 'Ese nombre de usuario ya está en uso.'
    return 'Ya existe un registro igual.'
  }
  if (err?.code === '23514' || /check constraint/i.test(msg)) {
    if (/username/i.test(msg)) return 'El usuario debe tener 3–24 caracteres: letras, números o _.'
    return 'Algún dato no es válido.'
  }
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/Email not confirmed/i.test(msg)) return 'Tenés que confirmar tu email primero (revisá tu correo).'
  if (/User already registered/i.test(msg)) return 'Ya hay una cuenta con ese email. Iniciá sesión.'
  if (/Password should be at least/i.test(msg)) return 'La contraseña es demasiado corta (mínimo 6 caracteres).'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos o correos enviados. Esperá un rato y volvé a probar.'
  if (/row-level security/i.test(msg)) return 'No tenés permiso para hacer eso (¿es de otro día?).'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión. Revisá tu internet.'
  return msg
}
