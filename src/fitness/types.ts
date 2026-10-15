export type WorkoutStatus = 'completed' | 'rest'

export type ExerciseSet = {
  id: string
  reps?: number
  weightKg?: number
  durationSeconds?: number
  distanceKm?: number
  notes?: string
}

export type ExerciseEntry = {
  id: string
  exerciseName: string
  maxWeightKg?: number
  completed?: boolean
  muscleGroup?: string
  order: number
  sets: ExerciseSet[]
  notes?: string
}

export type WorkoutSession = {
  id: string
  date: string
  workoutType: string
  startTime?: string
  durationMinutes?: number
  notes?: string
  status: WorkoutStatus
  exercises: ExerciseEntry[]
}

export type BodyWeightEntry = {
  id: string
  date: string
  weightKg: number
  notes?: string
}

export type FitnessData = {
  version: 1
  workouts: WorkoutSession[]
  bodyWeights: BodyWeightEntry[]
  exerciseLibrary: string[]
}

export type DateRange = '4w' | '8w' | 'all'

