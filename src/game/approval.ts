// Votación democrática de cambios (porta reference/approval.mjs) y plan por día (reference/plan.mjs).
export type Vote = 'yes' | 'no'
export type Decision = 'approved' | 'rejected' | 'pending'

export function decide({ proposer, members, votes, windowElapsed }: {
  proposer: string; members: string[]; votes: Record<string, Vote | undefined>; windowElapsed: boolean
}): Decision {
  const voters = members.filter((m) => m !== proposer)
  const n = voters.length
  if (n === 0) return 'approved'
  const cast = voters.filter((v) => votes[v] === 'yes' || votes[v] === 'no')
  const yes = cast.filter((v) => votes[v] === 'yes').length
  const no = cast.length - yes
  if (yes > n / 2) return 'approved'
  if (no >= n / 2) return 'rejected'
  if (!windowElapsed) return 'pending'
  if (cast.length === 0) return 'approved'
  return yes > no ? 'approved' : 'rejected'
}

export const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export interface Snapshot<P> { effectiveFrom: string; plan: P }

export const snapshotFor = <P>(approvedLocalDate: string, plan: P): Snapshot<P> => ({ effectiveFrom: nextDay(approvedLocalDate), plan })

export function planForDay<P>(snapshots: Snapshot<P>[], dayIso: string): P | undefined {
  return snapshots
    .filter((s) => s.effectiveFrom <= dayIso)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]?.plan
}
