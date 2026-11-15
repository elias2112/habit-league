// Billetera derivada (porta reference/wallet.mjs). Nada se guarda. Puede quedar NEGATIVA; negativa bloquea compras.
// chests: monedas de los cofres de ahorro (hitos y «Cofre a salvo»), agregado de la app (decisión del dueño, provisional).
import { r2 } from './scoring'

export const walletBalance = ({ daily = 0, pool = 0, strength = 0, rankRewards = 0, chests = 0, penalties = 0, spent = 0 }: {
  daily?: number; pool?: number; strength?: number; rankRewards?: number; chests?: number; penalties?: number; spent?: number
}) => r2(daily + pool + strength + rankRewards + chests - penalties - spent)
