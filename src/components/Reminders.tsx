import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { ErrorBox } from './ui'

interface Prefs { water: boolean; water_hours: number[]; strength: boolean; strength_hour: number }
const DEFAULTS: Prefs = { water: true, water_hours: [11, 14, 17, 20], strength: true, strength_hour: 19 }
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7)   // 7 a 23 h

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const b64url = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '')

/** Recordatorios por notificación (agua y fuerza base). En iPhone, solo con la app en la pantalla de inicio. */
export default function Reminders() {
  const { session } = useAuth()
  const me = session!.user.id
  const [on, setOn] = useState<boolean | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported()) { setOn(false); return }
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setOn(Boolean(s))).catch(() => setOn(false))
    supabase.from('push_prefs').select('water, water_hours, strength, strength_hour').eq('user_id', me).maybeSingle()
      .then(({ data }) => { if (data) setPrefs(data as Prefs) })
  }, [me])

  async function enable() {
    setBusy(true); setError(null); setMsg(null)
    try {
      if (!VAPID) throw new Error('Falta la clave de notificaciones en la app (VITE_VAPID_PUBLIC_KEY).')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') throw new Error('No diste permiso. Se activa en Ajustes → Notificaciones → Habit League.')
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) })
      const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: b64url(sub.getKey('p256dh')), p_auth: b64url(sub.getKey('auth')) })
      if (error) throw error
      await save(prefs)
      setOn(true)
      setMsg('Listo: te vamos a avisar a esas horas.')
    } catch (e) {
      setError(errorMessage(e))
    } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) { await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); await sub.unsubscribe() }
      setOn(false)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  async function save(p: Prefs) {
    setPrefs(p)
    const { error } = await supabase.rpc('set_push_prefs', { p_water: p.water, p_water_hours: p.water_hours, p_strength: p.strength, p_strength_hour: p.strength_hour })
    setError(error ? errorMessage(error) : null)
  }
  const toggleHour = (h: number) => save({ ...prefs, water_hours: prefs.water_hours.includes(h) ? prefs.water_hours.filter((x) => x !== h) : [...prefs.water_hours, h].sort((a, b) => a - b) })

  return (
    <section className="card mt-5 space-y-3">
      <h2 className="font-bold">🔔 Recordatorios</h2>
      {!supported() || !standalone() ? (
        <p className="text-sm text-muted">
          Para recibir avisos, agregá la app a la pantalla de inicio y abrila desde ese ícono. En iPhone: Safari → Compartir → «Añadir a pantalla de inicio» (hace falta iOS 16.4 o más nuevo).
        </p>
      ) : on === null ? null : !on ? (
        <>
          <p className="text-sm text-muted">Te avisamos para tomar agua y, si todavía no la hiciste, para la fuerza base.</p>
          <button className="btn btn-primary w-full" disabled={busy} onClick={enable}>Activar recordatorios</button>
        </>
      ) : (
        <>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={prefs.water} onChange={(e) => save({ ...prefs, water: e.target.checked })} />
            💧 Tomar agua
          </label>
          {prefs.water && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horas del recordatorio de agua">
              {HOURS.map((h) => (
                <button key={h} onClick={() => toggleHour(h)} aria-pressed={prefs.water_hours.includes(h)}
                  className={`min-h-9 rounded-lg px-2 text-xs font-semibold transition ${prefs.water_hours.includes(h) ? 'bg-primary text-bg' : 'bg-surface-2 text-muted'}`}>{h} h</button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={prefs.strength} onChange={(e) => save({ ...prefs, strength: e.target.checked })} />
            💪 Fuerza base (solo si no la terminaste)
          </label>
          {prefs.strength && (
            <select className="input" value={prefs.strength_hour} onChange={(e) => save({ ...prefs, strength_hour: Number(e.target.value) })} aria-label="Hora del recordatorio de fuerza base">
              {HOURS.map((h) => <option key={h} value={h}>A las {h} h</option>)}
            </select>
          )}
          <p className="text-xs text-muted">Los avisos pueden llegar hasta una hora más tarde. Usa la zona horaria de tu perfil.</p>
          <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" disabled={busy} onClick={disable}>Apagar en este teléfono</button>
        </>
      )}
      {msg && <p className="text-sm text-primary">{msg}</p>}
      <ErrorBox>{error}</ErrorBox>
    </section>
  )
}
