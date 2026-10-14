import type { BodyWeightEntry, DateRange, WorkoutSession } from './types'

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const parsed = parseLocalDate(date)
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(undefined, options).format(parsed)
}

export function mondayFor(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - day)
  return result
}

export function isInCurrentWeek(date: string, now = new Date()) {
  const currentWeek = mondayFor(now).getTime()
  const nextWeek = currentWeek + 7 * 24 * 60 * 60 * 1000
  const timestamp = parseLocalDate(date).getTime()
  return timestamp >= currentWeek && timestamp < nextWeek
}

export function startForRange(range: DateRange, now = new Date()) {
  if (range === 'all') return undefined
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - (range === '4w' ? 27 : 55))
  return start
}

export function sessionsInRange(sessions: WorkoutSession[], range: DateRange, now = new Date()) {
  const start = startForRange(range, now)
  return sessions.filter((session) => session.status === 'completed' && (!start || parseLocalDate(session.date) >= start))
}

export function weightsInRange(entries: BodyWeightEntry[], range: DateRange, now = new Date()) {
  const start = startForRange(range, now)
  return [...entries]
    .filter((entry) => !start || parseLocalDate(entry.date) >= start)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function weeklyWorkoutCounts(sessions: WorkoutSession[], range: DateRange, now = new Date()) {
  const sessionsInPeriod = sessionsInRange(sessions, range, now)
  const thisMonday = mondayFor(now)
  let weekCount = range === '4w' ? 4 : range === '8w' ? 8 : 12
  if (range === 'all' && sessionsInPeriod.length) {
    const earliest = sessionsInPeriod.reduce((date, session) => {
      const sessionWeek = mondayFor(parseLocalDate(session.date))
      return sessionWeek < date ? sessionWeek : date
    }, thisMonday)
    weekCount = Math.max(1, Math.floor((thisMonday.getTime() - earliest.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
  }
  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = new Date(thisMonday)
    weekStart.setDate(thisMonday.getDate() - (weekCount - 1 - index) * 7)
    const nextWeek = new Date(weekStart)
    nextWeek.setDate(weekStart.getDate() + 7)
    const count = sessionsInPeriod.filter((session) => {
      const date = parseLocalDate(session.date)
      return date >= weekStart && date < nextWeek
    }).length
    return { weekStart, count }
  })
}

export function rangeLabel(range: DateRange) {
  return range === '4w' ? 'Last 4 weeks' : range === '8w' ? 'Last 8 weeks' : 'All time'
}

