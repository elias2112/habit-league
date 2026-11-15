import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { fmtCoins, type Strength, type StrengthDay } from '../lib/day'
import { exerciseName } from '../lib/strengthText'
import { CONFIG } from '../game/config'
import { ErrorBox } from './ui'

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const STATUS: Record<StrengthDay['status'], { icon: string; cls: string; label: string }> = {
  done: { icon: '✓', cls: 'bg-primary text-bg', label: 'cumplido' },
  forgiven: { icon: '≈', cls: 'bg-xp/30 text-xp', label: 'perdonado' },
  missed: { icon: '✕', cls: 'bg-danger/25 text-danger', label: 'fallado' },
}
const shortDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', timeZone: 'UTC' })

/** Fuerza base: la cadena de esta semana, lo que paga y los días fallados por saldar. */
export default function StrengthPanel({ s, onChange }: { s: Strength; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmPay, setConfirmPay] = useState<string | null>(null)
  const byDow = new Map(s.week.map((d) => [(new Date(d.date + 'T12:00:00Z').getUTCDay() + 6) % 7, d]))
  const weekCoins = s.week.reduce((t, d) => t + Number(d.coins), 0)
  const weekExp = s.week.reduce((t, d) => t + Number(d.exp), 0)

  async function settle(day: string, choice: 'extra' | 'pay') {
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('settle_strength_day', { p_day: day, p_choice: choice })
    setBusy(false); setConfirmPay(null)
    if (error) setError(errorMessage(error)); else onChange()
  }

  return (
    <div className="mb-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5" role="list" aria-label="Fuerza base de esta semana">
        {DOW.map((l, i) => {
          const d = byDow.get(i)
          const st = d ? STATUS[d.status] : null
          return (
            <div key={l} role="listitem" className="flex flex-1 flex-col items-center gap-1" aria-label={`${l}: ${st?.label ?? 'sin dato'}`}>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${st ? st.cls : 'bg-surface-2 text-muted'}`}>{st?.icon ?? ''}</span>
              <span className="text-[11px] text-muted">{l}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        Esta semana: <b className="text-xp">{fmtCoins(weekCoins)} monedas</b> y <b className="text-primary">{fmtCoins(weekExp)} de experiencia</b>.
        {' '}Cada día seguido paga más; con el {Math.round(CONFIG.forgiveRatio * 100)} % de la meta en cada ejercicio el día se perdona.
      </p>

      {s.pending_days.length > 0 && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-semibold">Tenés {s.pending_days.length === 1 ? 'un día fallado' : `${s.pending_days.length} días fallados`} sin saldar</p>
          <p className="text-xs text-muted">Hasta saldarlos, la fuerza base no paga (tenés retenidas {fmtCoins(s.held_coins)} monedas y {fmtCoins(s.held_exp)} de experiencia).</p>
          <ul className="mt-2 space-y-3">
            {s.pending_days.map((d) => (
              <li key={d.date}>
                <p className="font-semibold capitalize">{shortDate(d.date)}</p>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button className="btn btn-primary text-sm" disabled={busy} onClick={() => settle(d.date, 'extra')}>
                    Hice las {s.extra_reps} extra de {exerciseName(d.worst).toLowerCase()}
                  </button>
                  {confirmPay === d.date ? (
                    <button className="btn border border-danger/60 bg-danger/20 text-sm text-danger" disabled={busy} onClick={() => settle(d.date, 'pay')}>
                      Confirmar: pagar {fmtCoins(Number(d.missedCoins))} monedas y {fmtCoins(Number(d.missedExp))} de experiencia
                    </button>
                  ) : (
                    <button className="btn btn-ghost text-sm" disabled={busy} onClick={() => setConfirmPay(d.date)}>
                      Pagar {fmtCoins(Number(d.missedCoins))} monedas
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Las {s.extra_reps} extra son de honor y el grupo lo ve en la actividad. Pagar puede dejar tu billetera en negativo.</p>
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </div>
  )
}
