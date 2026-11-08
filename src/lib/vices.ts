// Sugerencias de vicios para cargar rápido (content/vices.json). El modelo de vicios es el de la v3:
// cada persona define los suyos (nombre libre, gravedad, peso) y los marca cada día en tres estados.
import vicesData from '../../content/vices.json'

export interface ViceSuggestion { id: string; name: string; area: string }
export const VICES = vicesData.vices as ViceSuggestion[]
export const viceById = (id: string | null | undefined) => VICES.find((v) => v.id === id)
