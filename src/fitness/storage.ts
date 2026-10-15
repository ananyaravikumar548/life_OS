import type { BodyWeightEntry, ExerciseEntry, ExerciseSet, FitnessData, WorkoutSession, WorkoutStatus } from './types'

const STORAGE_KEY = 'life-os.fitness.v1'
export const starterExerciseLibrary = ['Barbell squat', 'Bench press', 'Deadlift', 'Dumbbell row', 'Overhead press', 'Lat pulldown']

export function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseSet(value: unknown): ExerciseSet | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  return {
    id: value.id,
    reps: optionalNumber(value.reps),
    weightKg: optionalNumber(value.weightKg),
    durationSeconds: optionalNumber(value.durationSeconds),
    distanceKm: optionalNumber(value.distanceKm),
    notes: optionalText(value.notes),
  }
}

function parseExercise(value: unknown, index: number): ExerciseEntry | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.exerciseName !== 'string' || !value.exerciseName.trim()) return undefined
  const sets = Array.isArray(value.sets) ? value.sets.map(parseSet).filter((set): set is ExerciseSet => Boolean(set)) : []
  return {
    id: value.id,
    exerciseName: value.exerciseName.trim(),
    maxWeightKg: optionalNumber(value.maxWeightKg),
    completed: typeof value.completed === 'boolean' ? value.completed : undefined,
    muscleGroup: optionalText(value.muscleGroup),
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : index,
    sets,
    notes: optionalText(value.notes),
  }
}

function parseWorkout(value: unknown): WorkoutSession | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string' || typeof value.workoutType !== 'string') return undefined
  const status: WorkoutStatus = value.status === 'rest' ? 'rest' : 'completed'
  const exercises = Array.isArray(value.exercises) ? value.exercises.map(parseExercise).filter((exercise): exercise is ExerciseEntry => Boolean(exercise)) : []
  return {
    id: value.id,
    date: value.date,
    workoutType: value.workoutType.trim() || 'Custom',
    startTime: optionalText(value.startTime),
    durationMinutes: optionalNumber(value.durationMinutes),
    notes: optionalText(value.notes),
    status,
    exercises: exercises.sort((a, b) => a.order - b.order),
  }
}

function parseBodyWeight(value: unknown): BodyWeightEntry | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string' || typeof value.weightKg !== 'number' || !Number.isFinite(value.weightKg) || value.weightKg <= 0) return undefined
  return { id: value.id, date: value.date, weightKg: value.weightKg, notes: optionalText(value.notes) }
}

export function emptyFitnessData(): FitnessData {
  return { version: 1, workouts: [], bodyWeights: [], exerciseLibrary: [...starterExerciseLibrary] }
}

export function loadFitnessData(): FitnessData {
  if (typeof window === 'undefined') return emptyFitnessData()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyFitnessData()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1) return emptyFitnessData()
    const workouts = Array.isArray(parsed.workouts) ? parsed.workouts.map(parseWorkout).filter((session): session is WorkoutSession => Boolean(session)) : []
    const bodyWeights = Array.isArray(parsed.bodyWeights) ? parsed.bodyWeights.map(parseBodyWeight).filter((entry): entry is BodyWeightEntry => Boolean(entry)) : []
    const hasSavedLibrary = Array.isArray(parsed.exerciseLibrary)
    const library = hasSavedLibrary ? (parsed.exerciseLibrary as unknown[]).filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).map((name) => name.trim()) : starterExerciseLibrary
    return {
      version: 1,
      workouts,
      bodyWeights,
      exerciseLibrary: [...new Set(library)],
    }
  } catch {
    return emptyFitnessData()
  }
}

export function saveFitnessData(data: FitnessData) {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 1 }))
    return true
  } catch {
    return false
  }
}
