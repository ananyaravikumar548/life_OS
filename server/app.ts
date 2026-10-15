import 'dotenv/config'
import express from 'express'
import { checkMongo, connectMongo, getDb } from './db.js'

const app = express()
const collections = new Set(['workspace', 'fitness', 'nutrition', 'think_space'])
const ownerId = 'local-life-os'

app.get('/api/health', async (_request, response) => {
  const database = await checkMongo()
  response.status(database ? 200 : 503).json({
    api: true,
    database: database ? 'connected' : 'unavailable',
  })
})

app.use(express.json({ limit: '2mb', strict: true }))

app.use('/api/data/:resource', async (request, response, next) => {
  if (!collections.has(request.params.resource)) return response.status(404).json({ error: 'Unknown data resource.' })
  try {
    await connectMongo()
    next()
  } catch {
    console.error('Protected data request could not be prepared.')
    response.status(503).json({ error: 'The database is unavailable. Your changes were not saved to MongoDB.' })
  }
})

app.get('/api/data/:resource', async (request, response) => {
  try {
    const document = await getDb().collection(request.params.resource).findOne({ ownerId })
    response.json({ data: document?.data ?? null, updatedAt: document?.updatedAt ?? null })
  } catch {
    response.status(503).json({ error: 'Could not read this data from MongoDB.' })
  }
})

app.post('/api/data/:resource/migrate', async (request, response) => {
  const resource = request.params.resource
  const localData: unknown = request.body?.data
  if (!isRecord(localData) || !validResourcePayload(resource, localData)) return response.status(400).json({ error: 'The local migration data is invalid and was left untouched.' })
  try {
    const collection = getDb().collection(resource)
    const existing = await collection.findOne({ ownerId })
    const alreadyMigrated = existing?.migrationComplete === true
    const data = alreadyMigrated ? existing.data : existing?.data ? mergeResource(resource, existing.data, localData) : localData
    if (!isRecord(data) || !validResourcePayload(resource, data)) return response.status(409).json({ error: 'Stored data could not be safely merged. Your local copy was left untouched.' })
    const now = new Date()
    await collection.updateOne(
      { ownerId },
      { $set: { data, migrationComplete: true, updatedAt: now }, $setOnInsert: { ownerId, createdAt: now } },
      { upsert: true },
    )
    response.json({ migrated: true, alreadyMigrated, data, recordCounts: recordCounts(resource, data) })
  } catch {
    response.status(503).json({ error: 'MongoDB could not complete the migration. Original local data was preserved.' })
  }
})

app.put('/api/data/:resource', async (request, response) => {
  const data: unknown = request.body?.data
  if (!isRecord(data) || !validResourcePayload(request.params.resource, data)) return response.status(400).json({ error: 'The data payload is invalid.' })
  try {
    const collection = getDb().collection(request.params.resource)
    const existing = await collection.findOne({ ownerId })
    if (!existing || existing.migrationComplete !== true) return response.status(409).json({ error: 'Initial local data migration must finish before cloud updates are accepted. Refresh to retry the safe migration.' })
    const now = new Date()
    await collection.updateOne(
      { ownerId },
      { $set: { data, updatedAt: now }, $setOnInsert: { ownerId, createdAt: now } },
      { upsert: true },
    )
    response.json({ saved: true, updatedAt: now.toISOString(), recordCounts: recordCounts(request.params.resource, data) })
  } catch {
    response.status(503).json({ error: 'Could not save this data to MongoDB.' })
  }
})

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next
  if (error instanceof SyntaxError) return response.status(400).json({ error: 'Request body must be valid JSON.' })
  response.status(500).json({ error: 'The server could not complete this request.' })
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validResourcePayload(resource: string, data: Record<string, unknown>) {
  if (resource === 'workspace') return records(data.tasks, (item) => typeof item.title === 'string' && typeof item.category === 'string' && typeof item.completed === 'boolean' && typeof item.priority === 'boolean')
    && records(data.academicContainers, (item) => typeof item.title === 'string')
    && records(data.careerProjects, (item) => typeof item.title === 'string')
  if (resource === 'fitness') return data.version === 1
    && records(data.workouts, (item) => calendarDate(item.date) && typeof item.workoutType === 'string' && ['completed', 'rest'].includes(String(item.status))
      && records(item.exercises, (exercise) => typeof exercise.exerciseName === 'string' && typeof exercise.order === 'number'
        && optionalNonnegativeNumber(exercise.maxWeightKg) && (exercise.completed === undefined || typeof exercise.completed === 'boolean')
        && records(exercise.sets, (set) => optionalNonnegativeNumber(set.reps) && optionalNonnegativeNumber(set.weightKg) && optionalNonnegativeNumber(set.durationSeconds) && optionalNonnegativeNumber(set.distanceKm))))
    && records(data.bodyWeights, (item) => calendarDate(item.date) && typeof item.weightKg === 'number' && Number.isFinite(item.weightKg) && item.weightKg > 0)
    && Array.isArray(data.exerciseLibrary) && data.exerciseLibrary.every((name) => typeof name === 'string' && name.length <= 120)
  if (resource === 'nutrition') return data.version === 1
    && records(data.foods, (item) => typeof item.name === 'string' && ['g', 'ml', 'piece', 'slice', 'scoop', 'cup', 'serving'].includes(String(item.servingUnit)) && typeof item.servingAmount === 'number'
      && optionalNonnegativeNumber(item.caloriesKcal) && optionalNonnegativeNumber(item.proteinG) && optionalNonnegativeNumber(item.carbohydratesG) && optionalNonnegativeNumber(item.fatG))
    && records(data.entries, (item) => calendarDate(item.date) && typeof item.foodName === 'string' && typeof item.meal === 'string'
      && optionalNonnegativeNumber(item.caloriesKcal) && optionalNonnegativeNumber(item.proteinG) && optionalNonnegativeNumber(item.carbohydratesG) && optionalNonnegativeNumber(item.fatG))
    && keyedRecords(data.dailyLogs, 'date', (item) => calendarDate(item.date) && isRecord(item.meals))
    && records(data.waterEntries, (item) => calendarDate(item.date) && typeof item.amountMl === 'number' && item.amountMl > 0)
    && records(data.recipes, (item) => typeof item.name === 'string' && objects(item.ingredients, (ingredient) => typeof ingredient.foodId === 'string' && typeof ingredient.amount === 'number' && ingredient.amount > 0))
    && isRecord(data.goals) && typeof data.goals.caloriesKcal === 'number' && data.goals.caloriesKcal > 0 && typeof data.goals.proteinG === 'number' && data.goals.proteinG > 0 && typeof data.goals.waterMl === 'number' && data.goals.waterMl > 0
  if (resource === 'think_space') return data.version === 1 && records(data.thoughts, (item) => typeof item.content === 'string' && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string') && typeof item.pinned === 'boolean' && typeof item.archived === 'boolean'
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt))
    && (item.reviewDate === undefined || calendarDate(item.reviewDate)))
  return false
}

function records(value: unknown, validate: (item: Record<string, unknown>) => boolean): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  return value.every((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 160 || ids.has(item.id)) return false
    ids.add(item.id)
    return validate(item)
  })
}

function keyedRecords(value: unknown, key: string, validate: (item: Record<string, unknown>) => boolean): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return false
  const keys = new Set<string>()
  return value.every((item) => {
    if (!isRecord(item) || typeof item[key] !== 'string' || !item[key] || keys.has(item[key] as string)) return false
    keys.add(item[key] as string)
    return validate(item)
  })
}

function objects(value: unknown, validate: (item: Record<string, unknown>) => boolean): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => isRecord(item) && validate(item))
}

function optionalNonnegativeNumber(value: unknown) {
  return value === undefined || value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function calendarDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function recordCounts(resource: string, data: Record<string, unknown>) {
  if (resource === 'workspace') return { tasks: arrayLength(data.tasks), academicContainers: arrayLength(data.academicContainers), careerProjects: arrayLength(data.careerProjects) }
  if (resource === 'fitness') {
    const workouts = Array.isArray(data.workouts) ? data.workouts.filter(isRecord) : []
    const exercises = workouts.flatMap((workout) => Array.isArray(workout.exercises) ? workout.exercises.filter(isRecord) : [])
    const sets = exercises.reduce((total, exercise) => total + arrayLength(exercise.sets), 0)
    return { workouts: workouts.length, exercises: exercises.length, sets, bodyWeights: arrayLength(data.bodyWeights) }
  }
  if (resource === 'nutrition') return { foods: arrayLength(data.foods), entries: arrayLength(data.entries), dailyLogs: arrayLength(data.dailyLogs), waterEntries: arrayLength(data.waterEntries), recipes: arrayLength(data.recipes) }
  return { thoughts: arrayLength(data.thoughts) }
}

function arrayLength(value: unknown) { return Array.isArray(value) ? value.length : 0 }

function mergeRecords(existing: unknown, imported: unknown, key = 'id') {
  const output = Array.isArray(existing) ? [...existing] : []
  const keys = new Set(output.filter(isRecord).map((item) => item[key]).filter((value): value is string => typeof value === 'string'))
  for (const item of Array.isArray(imported) ? imported : []) {
    if (!isRecord(item) || typeof item[key] !== 'string' || keys.has(item[key])) continue
    output.push(item); keys.add(item[key])
  }
  return output
}

function mergeResource(resource: string, existingValue: unknown, importedValue: Record<string, unknown>) {
  if (!isRecord(existingValue)) return importedValue
  const existing = existingValue
  if (resource === 'workspace') return {
    ...existing,
    tasks: mergeRecords(existing.tasks, importedValue.tasks),
    academicContainers: mergeRecords(existing.academicContainers, importedValue.academicContainers),
    careerProjects: mergeRecords(existing.careerProjects, importedValue.careerProjects),
  }
  if (resource === 'fitness') return {
    ...existing,
    workouts: mergeRecords(existing.workouts, importedValue.workouts),
    bodyWeights: mergeRecords(existing.bodyWeights, importedValue.bodyWeights),
    exerciseLibrary: [...new Set([...(Array.isArray(existing.exerciseLibrary) ? existing.exerciseLibrary : []), ...(Array.isArray(importedValue.exerciseLibrary) ? importedValue.exerciseLibrary : [])])],
  }
  if (resource === 'nutrition') return {
    ...existing,
    foods: mergeRecords(existing.foods, importedValue.foods),
    entries: mergeRecords(existing.entries, importedValue.entries),
    dailyLogs: mergeRecords(existing.dailyLogs, importedValue.dailyLogs, 'date'),
    waterEntries: mergeRecords(existing.waterEntries, importedValue.waterEntries),
    recipes: mergeRecords(existing.recipes, importedValue.recipes),
    goals: { ...(isRecord(importedValue.goals) ? importedValue.goals : {}), ...(isRecord(existing.goals) ? existing.goals : {}) },
  }
  return { ...existing, thoughts: mergeRecords(existing.thoughts, importedValue.thoughts) }
}

export default app
