import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { fmtCoins, useMyDay } from '../lib/day'
import { propose } from '../lib/changes'
import { useGroups } from '../lib/groups'
import { CONFIG } from '../game/config'
import { BUY_REASON } from '../game/store'
import { ErrorBox, Loading, PageHeader } from '../components/ui'

/** Artículo de MI tienda (RPC my_store): precio según mis respuestas privadas por área; los ocultos no vienen. */
interface Item {
  id: string; slug: string | null; name: string; kind: 'permit' | 'reward'; price: number | null
  price_by_weight: Record<string, number> | null; weekly_limit: number | null; opt_in: boolean; opted: boolean
  unlock_level: number; locked: boolean; group_only: boolean; registry_only: boolean; conflict: boolean; bought_this_week: number
}

const SECTIONS = [
  { id: 'permit', title: 'Permisos', hint: 'Un permiso cubre una recaída ese día: no multiplica tus puntos ni baja tu racha de monedas. Solo aparecen si los activás. Su precio depende de lo que contestaste en el cuestionario (es privado). Los límites son ajustes del juego, no consejos médicos.' },
  { id: 'reward', title: 'Premios', hint: 'Para darte un gusto. Son solo registro: aparecen en la actividad del grupo y no cambian ningún cálculo.' },
  { id: 'voucher', title: 'Vales del grupo', hint: 'Se desbloquean con tu nivel. Son solo registro: la app no mueve plata; el grupo cumple lo que dice el vale.' },
] as const
const sectionOf = (it: Item) => (it.group_only ? 'voucher' : it.kind)

export default function Store() {
  const { day, reload } = useMyDay()
  const { selected: group } = useGroups()
  const [items, setItems] = useState<Item[]>([])
  const [buying, setBuying] = useState<Item | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_store')
    if (error) return setError(errorMessage(error))
    setItems(((data ?? []) as Item[]).map((x) => ({ ...x, price: x.price == null ? null : Number(x.price), bought_this_week: Number(x.bought_this_week) })))
  }, [])
  useEffect(() => { if (group) void load() }, [load, group])

  async function toggleOptin(it: Item) {
    const { error } = await supabase.rpc('set_optin', { p_item: it.id, p_on: !it.opted })
    setError(error ? errorMessage(error) : null)
    await load()
  }

  async function buy(it: Item, viceId: string | null, habitId: string | null) {
    setError(null); setMsg(null)
    const { data, error } = await supabase.rpc('buy_item', { p_item: it.id, p_vice: viceId, p_habit: habitId, p_objective: null })
    if (error) return setError(errorMessage(error))
    const r = data as { ok: boolean; reason?: string; price?: number }
    if (!r.ok) return setError(BUY_REASON[r.reason ?? ''] ?? 'No se pudo comprar.')
    setMsg(`Compraste «${it.name}» por ${fmtCoins(Number(r.price))} monedas. Aparece en la actividad del grupo.`)
    setBuying(null)
    await Promise.all([load(), reload()])
  }

  if (!day) return <Loading />
  if (!group) return <><PageHeader title="Tienda" /><p className="card text-sm text-muted">Uníte a un grupo para usar la tienda.</p></>

  const w = day.wallet
  const parts = [
    ['Días cerrados', w.daily], ['Pool de semanas cerradas', w.pool], ['Fuerza base', w.strength], ['Premios de rango', w.rank_rewards],
    ['Cofres de ahorro', w.chests], ['Días de fuerza base pagados', -w.penalties], ['Compras', -w.spent],
  ] as const

  return (
    <>
      <PageHeader title="Tienda" subtitle="Jodita coin: 1 moneda = 1 €. Gastar nunca baja tu ranking." />

      <section className="card mb-4">
        <p className="text-sm text-muted">Billetera</p>
        <p className={`text-4xl font-black tabular-nums ${w.balance < 0 ? 'text-danger' : 'text-xp'}`}>🪙 {fmtCoins(w.balance)}</p>
        {w.balance < 0 && <p className="mt-1 text-sm text-danger">Estás en negativo: no podés comprar hasta recuperarte.</p>}
        <ul className="mt-2 space-y-0.5 text-sm text-muted">
          <li>Hoy vas sumando <b className="text-ink">{fmtCoins(w.today_credit)}</b> (se cobra al cerrar el día).</li>
          <li>Pool de excedente de esta semana: <b className="text-ink">{fmtCoins(w.pool_this_week)}</b> (se cobra al cerrar la semana).</li>
          <li>Racha de monedas: <b className="text-ink">{w.streak} {w.streak === 1 ? 'día' : 'días'}</b> · multiplicador <b className="text-ink">×{w.today_multiplier.toLocaleString('es-ES')}</b> (+{CONFIG.streakStepBonus.toLocaleString('es-ES')} cada {CONFIG.streakStepDays} días con {CONFIG.coinThresholdLow}+ puntos).</li>
        </ul>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted">De dónde sale</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {parts.map(([label, v]) => (
              <li key={label} className="flex justify-between"><span className="text-muted">{label}</span><span className="tabular-nums">{v > 0 ? '+' : ''}{fmtCoins(v)}</span></li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Los premios de rango se quitan si perdés el rango y vuelven si lo recuperás.</p>
        </details>
        <p className="mt-2 text-xs text-muted">{CONFIG.coinThresholdLow} puntos en el día = {CONFIG.coinsAt75} monedas; {CONFIG.coinThresholdHigh} = {CONFIG.coinsAt100} en total. Una recaída sin permiso baja un escalón de racha.</p>
      </section>

      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="mb-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{msg}</p>}

      {SECTIONS.map((sec) => {
        const list = items.filter((it) => sectionOf(it) === sec.id && !it.conflict)
        if (list.length === 0) return null
        return (
          <section key={sec.id} className="mb-6">
            <h2 className="mb-1 font-bold">{sec.title}</h2>
            <p className="mb-2 text-xs text-muted">{sec.hint}</p>
            <ul className="stagger space-y-2">
              {list.map((it) => {
                const off = it.opt_in && !it.opted
                return (
                  <li key={it.id} className={`card ${it.locked ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{it.locked && '🔒 '}{it.name}</p>
                        <p className="text-xs text-muted">
                          {it.price_by_weight ? `${Object.values(it.price_by_weight).join('/')} según el peso del hábito` : it.price == null ? 'sin precio' : `${fmtCoins(it.price)} monedas`}
                          {it.weekly_limit != null && ` · ${it.bought_this_week}/${it.weekly_limit} esta semana`}
                          {it.locked && ` · se desbloquea en el nivel ${it.unlock_level}`}
                        </p>
                      </div>
                      {it.opt_in && !it.locked && (
                        <button className="btn btn-ghost min-h-9 shrink-0 px-3 py-1 text-xs" onClick={() => toggleOptin(it)}>{off ? 'Activar' : 'Desactivar'}</button>
                      )}
                    </div>
                    {!off && !it.locked && (
                      buying?.id === it.id
                        ? <BuyForm it={it} vices={day.vices} habits={day.habits} onBuy={buy} onCancel={() => setBuying(null)} />
                        : <div className="mt-2 flex gap-2">
                            <button className="btn btn-primary min-h-9 px-3 py-1 text-sm" disabled={(it.price == null && !it.price_by_weight) || w.balance < 0}
                              onClick={() => (it.kind === 'permit' || it.price_by_weight ? setBuying(it) : buy(it, null, null))}>Comprar</button>
                            <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => setEditing(editing === it.id ? null : it.id)}>Proponer cambio</button>
                          </div>
                    )}
                    {editing === it.id && <ItemChange it={it} onDone={(t) => { setEditing(null); setMsg(t) }} onError={setError} />}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <NewItem onDone={setMsg} onError={setError} />
      <p className="mt-4 text-xs text-muted">Los precios y los límites los cambia el grupo por votación.</p>
    </>
  )
}

function BuyForm({ it, vices, habits, onBuy, onCancel }: {
  it: Item; vices: { id: string; name: string }[]; habits: { id: string; name: string; weight: number }[]
  onBuy: (it: Item, vice: string | null, habit: string | null) => void; onCancel: () => void
}) {
  const [vice, setVice] = useState(vices[0]?.id ?? '')
  const [habit, setHabit] = useState(habits[0]?.id ?? '')
  const h = habits.find((x) => x.id === habit)
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      {it.kind === 'permit' && (
        vices.length === 0
          ? <p className="text-sm text-muted">Necesitás un vicio en tu plan para usar un permiso.</p>
          : <><label className="label" htmlFor="bv">¿Qué vicio cubre hoy?</label>
              <select id="bv" className="input" value={vice} onChange={(e) => setVice(e.target.value)}>{vices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></>
      )}
      {it.price_by_weight && (
        <><label className="label" htmlFor="bh">¿Qué hábito?</label>
          <select id="bh" className="input" value={habit} onChange={(e) => setHabit(e.target.value)}>{habits.map((x) => <option key={x.id} value={x.id}>{x.name} (peso {x.weight})</option>)}</select>
          {h && <p className="text-xs text-muted">Cuesta {it.price_by_weight[String(h.weight)]} monedas.</p>}</>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={(it.kind === 'permit' && !vice) || (Boolean(it.price_by_weight) && !habit)}
          onClick={() => onBuy(it, it.kind === 'permit' ? vice : null, it.price_by_weight ? habit : null)}>Confirmar</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function ItemChange({ it, onDone, onError }: { it: Item; onDone: (msg: string) => void; onError: (e: string | null) => void }) {
  const [price, setPrice] = useState(it.price != null ? String(it.price) : '')
  const [limit, setLimit] = useState(it.weekly_limit != null ? String(it.weekly_limit) : '')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await propose('group', 'store.update', {
      item_id: it.id, name: it.name,
      ...(price !== '' && Number(price) !== it.price ? { price: Number(price) } : {}),
      ...(limit !== (it.weekly_limit != null ? String(it.weekly_limit) : '') ? { weekly_limit: limit === '' ? null : Number(limit) } : {}),
    })
    if (error) return onError(errorMessage(error))
    onError(null)
    onDone('Propuesta enviada al grupo.')
  }
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
      <input className="input" type="number" min={0} step="0.5" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Precio" />
      <input className="input" type="number" min={0} placeholder="Límite semanal (vacío = sin límite)" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Límite semanal" />
      <button className="btn btn-primary col-span-2">Proponer al grupo</button>
    </form>
  )
}

function NewItem({ onDone, onError }: { onDone: (msg: string) => void; onError: (e: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  if (!open) return <button className="btn btn-ghost w-full" onClick={() => setOpen(true)}>+ Proponer un premio nuevo</button>
  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await propose('group', 'store.add', { name: name.trim(), price: Number(price), kind: 'reward' })
    if (error) return onError(errorMessage(error))
    onError(null); setOpen(false); setName(''); setPrice('')
    onDone('Propuesta enviada al grupo.')
  }
  return (
    <form onSubmit={submit} className="card space-y-2">
      <input className="input" required maxLength={60} placeholder="Premio (ej.: una entrada al recital)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" required type="number" min={0} placeholder="Precio en monedas (precio real)" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={!name.trim() || price === ''}>Proponer</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  )
}
