import type { ThinkSpaceData, Thought } from './types'

const STORAGE_KEY = 'life-os.think-space.v1'
const LEGACY_KEYS = [
  { key: 'life-os.inbox.v1', category: undefined },
  { key: 'life-os.goals.v1', category: 'Dreams & Goals' },
  { key: 'life-os.inbox', category: undefined },
  { key: 'life-os.goals', category: 'Dreams & Goals' },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function parseThought(value: unknown): Thought | undefined {
  if (!isRecord(value)) return undefined
  const content = text(value.content) || text(value.body) || text(value.text) || text(value.description)
  const title = text(value.title) || text(value.name)
  if (!content && !title) return undefined
  const now = new Date().toISOString()
  const tags = Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean) : []
  return {
    id: text(value.id) || `thought-${crypto.randomUUID()}`,
    ...(title ? { title } : {}), content: content || title,
    ...(text(value.category) ? { category: text(value.category) } : {}), tags,
    createdAt: text(value.createdAt) || text(value.created_at) || now,
    updatedAt: text(value.updatedAt) || text(value.updated_at) || now,
    pinned: value.pinned === true, archived: value.archived === true || value.status === 'archived',
    ...(text(value.reviewDate) ? { reviewDate: text(value.reviewDate) } : {}),
    ...(value.isGoal === true ? { isGoal: true } : {}),
  }
}

export function emptyThinkSpaceData(): ThinkSpaceData { return { version: 1, thoughts: [], migrationComplete: false } }

export function loadThinkSpaceData(): ThinkSpaceData {
  if (typeof window === 'undefined') return emptyThinkSpaceData()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    if (isRecord(parsed) && parsed.version === 1 && Array.isArray(parsed.thoughts)) {
      const thoughts = parsed.thoughts.map(parseThought).filter((thought): thought is Thought => Boolean(thought))
      if (parsed.migrationComplete === true) return { version: 1, thoughts, migrationComplete: true }
      return migrateLegacy({ version: 1, thoughts, migrationComplete: false })
    }
    return migrateLegacy(emptyThinkSpaceData())
  } catch { return emptyThinkSpaceData() }
}

function migrateLegacy(data: ThinkSpaceData): ThinkSpaceData {
  const migrated = [...data.thoughts]
  for (const source of LEGACY_KEYS) {
    try {
      const raw = window.localStorage.getItem(source.key)
      if (!raw) continue
      const parsed: unknown = JSON.parse(raw)
      const values = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.items ?? parsed.goals ?? parsed.inbox : []
      if (!Array.isArray(values)) continue
      for (const value of values) {
        const thought = parseThought(value)
        if (!thought || migrated.some((item) => item.id === thought.id)) continue
        migrated.push({ ...thought, ...(source.category && !thought.category ? { category: source.category } : {}) })
      }
    } catch { /* Leave malformed legacy storage untouched for recovery. */ }
  }
  return { version: 1, thoughts: migrated, migrationComplete: true }
}

export function saveThinkSpaceData(data: ThinkSpaceData) {
  if (typeof window === 'undefined') return false
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 1 })); return true } catch { return false }
}
