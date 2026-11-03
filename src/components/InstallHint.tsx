import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

const KEY = 'hl:installHintDismissed'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Invita a instalar la app en la pantalla de inicio (iOS: instrucciones; Android/Chrome: botón). */
export default function InstallHint() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => {
    setDismissed(true)
    try { localStorage.setItem(KEY, '1') } catch { /* sin almacenamiento */ }
  }

  if (dismissed || isStandalone()) return null
  const ios = isIOS()
  if (!ios && !prompt) return null

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/50 bg-primary/10 p-3 text-sm">
      <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" className="h-10 w-10 rounded-xl" />
      <div className="flex-1">
        <p className="font-semibold text-ink">Instalá Habit League</p>
        {ios ? (
          <p className="mt-0.5 text-muted">
            En Safari tocá{' '}
            <svg viewBox="0 0 24 24" className="inline h-4 w-4 -translate-y-0.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Compartir">
              <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>{' '}
            <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>. Se abrirá como una app, a pantalla completa.
          </p>
        ) : (
          <button className="btn btn-primary mt-2 px-3 py-1.5 text-sm" onClick={async () => { await prompt!.prompt(); close() }}>
            Instalar app
          </button>
        )}
      </div>
      <button onClick={close} className="px-1 text-lg leading-none text-muted" aria-label="Cerrar">×</button>
    </div>
  )
}
