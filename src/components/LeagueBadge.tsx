import { TRIALS, rankLabel, stageById, type LeagueState } from '../lib/league'
import { Bar } from './ui'

/** Insignia de rango: etapa + división, barra de PL, escudo y prueba pendiente. */
export default function LeagueBadge({ s, compact = false }: { s: LeagueState; compact?: boolean }) {
  const st = stageById(s.stage)
  const shielded = s.shield_until && new Date(s.shield_until + 'T23:59:59') >= new Date()
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-bold" title={st.theme}>
        <span aria-hidden>{st.emoji}</span>{rankLabel(s.stage, s.division)}
        <span className="text-xs font-semibold text-muted tabular-nums">{s.pl} PL</span>
      </span>
    )
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/50 bg-primary/10 text-2xl" aria-hidden>{st.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black leading-tight">{rankLabel(s.stage, s.division)} {shielded && <span title="Escudo: no podés bajar por unos días">🛡️</span>}</p>
          <p className="text-xs text-muted">{st.theme}</p>
        </div>
        <span className="text-right text-sm font-bold tabular-nums text-primary">{s.pl}<span className="text-muted">/100 PL</span></span>
      </div>
      <div className="mt-2"><Bar value={s.pl} max={100} className="bg-primary" /></div>
      {s.trial_ready && TRIALS[s.stage] && (
        <p className="mt-2 rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-xs text-xp">
          🔓 Para pasar a la próxima etapa: <b>{TRIALS[s.stage]}</b>.
        </p>
      )}
    </div>
  )
}
