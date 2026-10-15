import test from 'node:test'
import assert from 'node:assert/strict'
import {
  localDateFromTimestamp,
  normalizeCategory,
  parseWorkspaceTasks,
  removeTask,
  setTaskCompletion,
  tasksAvailableOnDate,
  upsertTask,
} from '../src/tasks/model.ts'
import { readLocalSnapshot, writeLocalSnapshot } from '../src/data/api.ts'

function task(overrides = {}) {
  return {
    id: 'task-1', title: 'Finish report', category: 'Personal', completed: false,
    priority: false, createdAt: '2026-10-14T10:00:00.000Z', ...overrides,
  }
}

test('checking moves a task out of pending and undo restores it', () => {
  const original = [task()]
  const checked = setTaskCompletion(original, 'task-1', true, '2026-10-14T12:00:00.000Z')
  assert.equal(checked.filter((entry) => !entry.completed).length, 0)
  const restored = setTaskCompletion(checked, 'task-1', false, '2026-10-14T13:00:00.000Z')
  assert.equal(restored.filter((entry) => !entry.completed).length, 1)
  assert.equal(restored[0].createdAt, original[0].createdAt)
})

test('deletion removes only the selected task', () => {
  const tasks = [task(), task({ id: 'task-2', title: 'Pay rent' })]
  assert.deepEqual(removeTask(tasks, 'task-1').map((entry) => entry.id), ['task-2'])
})

test('all existing task categories are preserved during parsing', () => {
  const tasks = parseWorkspaceTasks([task({ category: 'Academics', academicContainerId: 'class-1' }), task({ id: 'task-2', category: 'Career', completed: true, careerProjectId: 'project-1' }), task({ id: 'task-3', category: 'Personal' })])
  assert.deepEqual(tasks.map((entry) => entry.category), ['Academics', 'Career', 'Personal'])
  assert.equal(tasks[0].academicContainerId, 'class-1')
  assert.equal(tasks[1].completed, true)
  assert.equal(tasks[1].careerProjectId, 'project-1')
  assert.equal(normalizeCategory('Career'), 'Career')
})

test('unfinished tasks carry across local dates without creating copies; completed tasks stay out of pending', () => {
  process.env.TZ = 'Asia/Kolkata'
  const createdAt = '2026-10-14T19:00:00.000Z'
  assert.equal(localDateFromTimestamp(createdAt), '2026-10-15')
  const original = [task({ createdAt })]
  const dayOne = tasksAvailableOnDate(original, '2026-10-15').filter((entry) => !entry.completed)
  const dayTwo = tasksAvailableOnDate(original, '2026-10-16').filter((entry) => !entry.completed)
  assert.deepEqual(dayOne.map((entry) => entry.id), ['task-1'])
  assert.deepEqual(dayTwo.map((entry) => entry.id), ['task-1'])
  const completed = setTaskCompletion(original, 'task-1', true)
  assert.equal(tasksAvailableOnDate(completed, '2026-10-16').filter((entry) => !entry.completed).length, 0)
  assert.equal(completed.length, 1)
})

test('refresh persistence restores the same task records and categories', () => {
  const entries = new Map()
  globalThis.window = { localStorage: { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) } }
  const workspace = { tasks: [task({ category: 'Career' })], academicContainers: [], careerProjects: [] }
  assert.equal(writeLocalSnapshot('workspace', workspace), true)
  const restored = readLocalSnapshot('workspace')
  assert.deepEqual(parseWorkspaceTasks(restored.tasks), workspace.tasks)
})

test('upserting repeatedly with one id does not duplicate a carried task', () => {
  let tasks = [task()]
  tasks = upsertTask(tasks, { ...tasks[0], updatedAt: '2026-10-15T09:00:00.000Z' })
  tasks = upsertTask(tasks, { ...tasks[0], updatedAt: '2026-10-16T09:00:00.000Z' })
  assert.equal(tasks.length, 1)
  assert.equal(tasksAvailableOnDate(tasks, '2026-10-20').length, 1)
})
