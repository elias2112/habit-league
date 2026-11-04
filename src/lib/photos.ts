import { supabase } from './supabase'

const BUCKET = 'evidencias'
const MAX_SIDE = 1080
const QUALITY = 0.72

/** Reduce la foto a ≤1080 px y JPEG (~100–250 KB) para cuidar el 1 GB gratis de Storage. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  const img: CanvasImageSource & { width: number; height: number } = bitmap ?? (await loadImg(file))
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  bitmap?.close()
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', QUALITY))
}

function loadImg(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('No se pudo leer la foto'))
    img.src = URL.createObjectURL(file)
  })
}

/** Sube la foto del check de hoy y la asocia al registro. Borra la anterior si había. */
export async function uploadEvidence(userId: string, habitId: string, file: File, previous?: string | null) {
  const blob = await compressImage(file)
  const path = `${userId}/${habitId}/${Date.now()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.rpc('set_log_photo', { p_habit: habitId, p_path: path })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  if (previous) await supabase.storage.from(BUCKET).remove([previous])
  return path
}

const cache = new Map<string, { url: string; exp: number }>()

/** URL firmada (1 h) para ver una foto; Storage verifica que seas dueño o compañero de grupo. */
export async function evidenceUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (!data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}
