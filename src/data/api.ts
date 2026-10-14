export type ResourceName = 'workspace' | 'fitness' | 'nutrition' | 'think_space'
export type RemoteSnapshot<T> = { data: T | null; updatedAt: string | null }
const writeQueues = new Map<ResourceName, Promise<void>>()

async function responseError(response: Response) {
  const result = await response.json().catch(() => ({})) as { error?: string; message?: string }
  return result.error || result.message || `Request failed (${response.status}).`
}

export async function readResource<T>(resource: ResourceName): Promise<RemoteSnapshot<T>> {
  const response = await fetch(`/api/data/${resource}`, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(await responseError(response))
  return await response.json() as RemoteSnapshot<T>
}

export async function migrateResource<T>(resource: ResourceName, localData: T): Promise<{ data: T; alreadyMigrated: boolean; recordCounts: Record<string, number> }> {
  const response = await fetch(`/api/data/${resource}/migrate`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: localData }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const result = await response.json() as { data: T; alreadyMigrated: boolean; recordCounts: Record<string, number> }
  const expected = expectedRecordCounts(resource, result.data)
  if (Object.entries(expected).some(([key, count]) => result.recordCounts?.[key] !== count)) throw new Error('Migration count verification failed. Original local data was preserved.')
  return result
}

export async function writeResource<T>(resource: ResourceName, data: T) {
  const operation = (writeQueues.get(resource) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const response = await fetch(`/api/data/${resource}`, {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
    if (!response.ok) throw new Error(await responseError(response))
    const result = await response.json() as { saved?: boolean; recordCounts?: Record<string, number> }
    const expected = expectedRecordCounts(resource, data)
    if (!result.saved || !result.recordCounts || Object.entries(expected).some(([key, count]) => result.recordCounts?.[key] !== count)) {
      throw new Error('MongoDB save count verification failed. The local copy was kept; retry the save.')
    }
  })
  writeQueues.set(resource, operation.then(() => undefined, () => undefined))
  return operation
}

function expectedRecordCounts(resource: ResourceName, value: unknown): Record<string, number> {
  const data = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const count = (key: string) => Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0
  if (resource === 'workspace') return { tasks: count('tasks'), academicContainers: count('academicContainers'), careerProjects: count('careerProjects') }
  if (resource === 'fitness') {
    const workouts = Array.isArray(data.workouts) ? data.workouts : []
    const exercises = workouts.flatMap((workout) => typeof workout === 'object' && workout !== null && Array.isArray((workout as Record<string, unknown>).exercises) ? (workout as { exercises: unknown[] }).exercises : [])
    const sets = exercises.reduce<number>((total, exercise) => total + (typeof exercise === 'object' && exercise !== null && Array.isArray((exercise as Record<string, unknown>).sets) ? (exercise as { sets: unknown[] }).sets.length : 0), 0)
    return { workouts: workouts.length, exercises: exercises.length, sets, bodyWeights: count('bodyWeights') }
  }
  if (resource === 'nutrition') return { foods: count('foods'), entries: count('entries'), dailyLogs: count('dailyLogs'), waterEntries: count('waterEntries'), recipes: count('recipes') }
  return { thoughts: count('thoughts') }
}

export function readLocalSnapshot<T>(resource: ResourceName): T | null {
  try {
    const raw = window.localStorage.getItem(`life-os.${resource}.v1`)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? value as T : null
  } catch { return null }
}

export function writeLocalSnapshot<T>(resource: ResourceName, data: T) {
  try { window.localStorage.setItem(`life-os.${resource}.v1`, JSON.stringify(data)); return true } catch { return false }
}
