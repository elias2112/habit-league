export interface Profile {
  id: string
  username: string
  display_name: string | null
  timezone: string
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
  icon: string | null
  xp_value: number
  archived: boolean
  created_at: string
}

export interface LeaderboardRow {
  user_id: string
  username: string
  display_name: string | null
  total_xp: number
  streak: number
}

export interface FeedRow {
  log_id: string
  user_id: string
  username: string
  habit_name: string
  habit_icon: string | null
  xp: number
  log_date: string
  created_at: string
}
