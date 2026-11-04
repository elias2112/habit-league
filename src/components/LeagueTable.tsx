import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { rankLabel, signed, stageById } from '../lib/league'
import { ErrorBox, Spinner } from './ui'

interface Row {
  user_id: string
  username: string
  display_name: string | null
  stage: string
  division: number
  pl: number
  last_day: string | null
  last_total: number | null
  last_detail: { text: string; answer: unknown; score: number }[] | null
}

const fmtAnswer = (a: unknown) => (a === true ? 'Sí' : a === false ? 'No' : a == null ? '—' : String(a))

/** Liga del grupo: rango, PL y último Juicio (con detalle si la persona lo comparte). */
export default function LeagueTable({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('group_league', { p_group: groupId }).then(({ data, error }) => {
      if (error) setError(errorMessage(error))
      setRows((data as Row[]) ?? [])
    })
  }, [groupId])

  if (!rows) return <div className="grid place-items-center pt-10"><Spinner /></div>
  return (
    <>
      <ErrorBox>{error}</ErrorBox>
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const st = stageById(r.stage)
          const isMe = r.user_id === me
          return (
            <li key={r.user_id} className={`rounded-2xl border p-3.5 ${isMe ? 'border-primary bg-primary/10' : 'border-line bg-surface'}`}>
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === r.user_id ? null : r.user_id)} aria-expanded={open === r.user_id}>
                <span className="w-6 text-center font-black tabular-nums text-muted">{i + 1}</span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl" aria-hidden>{st.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.display_name || r.username}{isMe && <span className="ml-1.5 text-xs font-semibold text-primary">(vos)</span>}</span>
                  <span className="block text-xs text-muted">{rankLabel(r.stage, r.division)} · {r.pl} PL</span>
                </span>
                {r.last_total != null && (
                  <span className={`text-sm font-bold tabular-nums ${r.last_total >= 0 ? 'text-alimentacion' : 'text-danger'}`} title="Último Juicio">
                    ⚖️ {signed(r.last_total)}
                  </span>
                )}
              </button>
              {open === r.user_id && (
                <div className="mt-3 border-t border-line pt-3 text-sm">
                  {r.last_detail ? (
                    <ul className="space-y-1">
                      {r.last_detail.map((d) => (
                        <li key={d.text} className="flex justify-between gap-3">
                          <span className="text-muted">{d.text}</span>
                          <span className="shrink-0 tabular-nums">{fmtAnswer(d.answer)} <b className={d.score >= 0 ? 'text-alimentacion' : 'text-danger'}>{signed(d.score)}</b></span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">{r.last_total == null ? 'Todavía no hizo ningún Juicio.' : 'Prefiere no mostrar el detalle de su Juicio.'}</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-center text-xs text-muted">
        🐪 Camello (disciplina) → 🦁 León (destruir vicios) → 🧒 Niño (disfrutar) → ✨ Zaratustra. Cada división se gana con 100 PL; los PL salen de tus hábitos y del Juicio de cada mañana.
      </p>
    </>
  )
}
