export type Category = 'Academics' | 'Career' | 'Personal'

export type Task = {
  id: string
  title: string
  category: Category
  duration?: number
  completed: boolean
  priority: boolean
  academicContainerId?: string
  careerProjectId?: string
  originThoughtId?: string
  createdAt?: string
  updatedAt?: string
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localDateFromTimestamp(value?: string) {
  if (!value) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : localDateString(parsed)
}

export function normalizeCategory(value: unknown): Category {
  return value === 'Academics' || value === 'Career' ? value : 'Personal'
}

export function tasksAvailableOnDate(tasks: Task[], date: string) {
  return tasks.filter((task) => {
    const createdDate = localDateFromTimestamp(task.createdAt)
    return !createdDate || createdDate <= date
  })
}

export function setTaskCompletion(tasks: Task[], id: string, completed: boolean, updatedAt = new Date().toISOString()) {
  return tasks.map((task) => task.id === id ? { ...task, completed, updatedAt } : task)
}

export function upsertTask(tasks: Task[], task: Task) {
  const exists = tasks.some((item) => item.id === task.id)
  return exists ? tasks.map((item) => item.id === task.id ? task : item) : [task, ...tasks]
}

export function removeTask(tasks: Task[], id: string) {
  return tasks.filter((task) => task.id !== id)
}

export function parseWorkspaceTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).id === 'string' && typeof (item as Record<string, unknown>).title === 'string' && typeof (item as Record<string, unknown>).completed === 'boolean' && typeof (item as Record<string, unknown>).priority === 'boolean')
    .map((item) => ({ ...item, category: normalizeCategory(item.category) })) as Task[]
}
