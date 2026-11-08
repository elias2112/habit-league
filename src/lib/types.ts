export interface Profile {
  id: string
  username: string
  display_name: string | null
  timezone: string
  archetype: string | null
  area_scores: Record<string, number>
  quiz_completed_at: string | null
}

export interface Group {
  id: string
  name: string
  invite_code: string
  created_by: string
  start_date: string
  duration_days: number
}

export interface Habit {
  id: string
  user_id: string
  name: string
  tier: number
  area: string | null
  catalog_id: string | null
  target: number
  unit: string | null
  private: boolean
  goal_id: string | null
  goal_step: number
  criterion: string | null
  archived: boolean
  created_at: string
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface MyReview { habit_id: string; group_id: string; group_name: string; status: ReviewStatus }

export interface GroupReview {
  habit_id: string
  owner_id: string
  owner_username: string
  habit_name: string
  criterion: string | null
  area: string | null
  tier: number
  target: number
  unit: string | null
  status: ReviewStatus
  yes: number
  no: number
  others: number
  my_vote: boolean | null
  created_at: string
  decided_at: string | null
}

export interface LeaderboardRow {
  user_id: string
  username: string
  display_name: string | null
  archetype: string | null
  total_points: number
  legacy_points: number
  max_points: number
  pct: number | null
  streak: number
  multiplier: number
}

export interface FeedRow {
  log_id: string
  user_id: string
  username: string
  habit_name: string
  habit_area: string | null
  points: number
  count: number
  target: number
  unit: string | null
  photo_path: string | null
  is_private: boolean
  log_date: string
  created_at: string
}

export interface Goal {
  id: string
  title: string
  kind: 'ahorro' | 'lectura' | 'escritura' | 'general'
  target: number
  unit: string
  deadline: string | null
  archived: boolean
  created_at: string
  progress: number
}
