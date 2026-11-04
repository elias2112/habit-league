import { useEffect, useState } from 'react'
import { evidenceUrl } from '../lib/photos'

/** Miniatura de una foto de Storage (URL firmada). Toca para verla grande. */
export default function EvidencePhoto({ path, className = 'h-14 w-14' }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    evidenceUrl(path).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path])

  if (!url) return <span className={`${className} block animate-pulse rounded-xl bg-surface-2`} aria-hidden />
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0" aria-label="Ver foto">
        <img src={url} alt="Foto del hábito" className={`${className} rounded-xl border border-line object-cover`} loading="lazy" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setOpen(false)} role="dialog" aria-label="Foto">
          <img src={url} alt="Foto del hábito" className="max-h-[85vh] max-w-full rounded-2xl" />
        </div>
      )}
    </>
  )
}
