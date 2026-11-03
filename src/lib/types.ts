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
  archived: boolean
  created_at: string
}

export interface LeaderboardRow {
  user_id: string
  username: string
  display_name: string | null
  archetype: string | null
  total_points: number
  max_points: number
  pct: number | null
  streak: number
}

export interface FeedRow {
  log_id: string
  user_id: string
  username: string
  habit_name: string
  habit_area: string | null
  points: number
  log_date: string
  created_at: string
}
