import { mealTypes } from './types'
import type { DailyNutritionLog, FoodItem, FoodLogEntry, InsightRange, MealType, NutritionData, NutritionGoals } from './types'

export function nutritionDateString(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

export function displayNutritionDate(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(undefined, options).format(parsed)
}

export function scaleNutrition(food: FoodItem, amount: number) {
  const base = food.nutritionBasis === '100g' ? 100 : food.servingAmount
  const factor = base > 0 ? amount / base : 0
  return {
    caloriesKcal: food.caloriesKcal === undefined ? undefined : round(food.caloriesKcal * factor),
    proteinG: food.proteinG === undefined ? undefined : round(food.proteinG * factor, 1),
    carbohydratesG: food.carbohydratesG === undefined ? undefined : round(food.carbohydratesG * factor, 1),
    fatG: food.fatG === undefined ? undefined : round(food.fatG * factor, 1),
  }
}

function round(value: number, digits = 0) {
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

export function summarizeEntries(entries: FoodLogEntry[]) {
  return entries.reduce((summary, entry) => ({
    caloriesKcal: summary.caloriesKcal + (entry.caloriesKcal ?? 0),
    proteinG: summary.proteinG + (entry.proteinG ?? 0),
    carbohydratesG: summary.carbohydratesG + (entry.carbohydratesG ?? 0),
    fatG: summary.fatG + (entry.fatG ?? 0),
    unknownNutrition: summary.unknownNutrition + (entry.caloriesKcal === undefined || entry.proteinG === undefined ? 1 : 0),
    missingCalories: summary.missingCalories + (entry.caloriesKcal === undefined ? 1 : 0),
    missingProtein: summary.missingProtein + (entry.proteinG === undefined ? 1 : 0),
    estimatedNutrition: summary.estimatedNutrition + (entry.estimated ? 1 : 0),
  }), { caloriesKcal: 0, proteinG: 0, carbohydratesG: 0, fatG: 0, unknownNutrition: 0, missingCalories: 0, missingProtein: 0, estimatedNutrition: 0 })
}

export function mealSummary(entries: FoodLogEntry[], meal: MealType) {
  return summarizeEntries(entries.filter((entry) => entry.meal === meal))
}

export function getDailyLog(logs: DailyNutritionLog[], date: string): DailyNutritionLog {
  return logs.find((log) => log.date === date) ?? { date, meals: {} }
}

export function updateMeal(log: DailyNutritionLog, meal: MealType, patch: { reviewed?: boolean; note?: string }) {
  const current = log.meals[meal] ?? {}
  return { ...log, meals: { ...log.meals, [meal]: { ...current, ...patch } } }
}

export function replaceDailyLog(logs: DailyNutritionLog[], next: DailyNutritionLog) {
  const hasContent = Object.values(next.meals).some((value) => value?.reviewed || value?.note?.trim())
  return hasContent ? [next, ...logs.filter((log) => log.date !== next.date)] : logs.filter((log) => log.date !== next.date)
}

export function dayRangeStart(range: InsightRange, today = new Date()) {
  if (range === 'all') return undefined
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  start.setDate(start.getDate() - (range === '7d' ? 6 : 27))
  return nutritionDateString(start)
}

export function nutritionHistory(data: NutritionData, range: InsightRange, today = new Date()) {
  const start = dayRangeStart(range, today)
  const dates = new Set<string>()
  for (const entry of data.entries) dates.add(entry.date)
  for (const entry of data.waterEntries) dates.add(entry.date)
  for (const log of data.dailyLogs) dates.add(log.date)
  return [...dates].filter((date) => !start || date >= start).sort((a, b) => b.localeCompare(a)).map((date) => {
    const entries = data.entries.filter((entry) => entry.date === date)
    const water = data.waterEntries.filter((entry) => entry.date === date)
    const summary = summarizeEntries(entries)
    const dayLog = getDailyLog(data.dailyLogs, date)
    const hasMealNote = Object.values(dayLog.meals).some((meal) => Boolean(meal?.note?.trim() || meal?.reviewed))
    const hasCompleteNutrition = entries.length > 0 && summary.unknownNutrition === 0
    return {
      date, entries, water, summary,
      waterMl: water.reduce((total, entry) => total + entry.amountMl, 0),
      kind: entries.length ? 'Food logged' : water.length ? 'Water only' : hasMealNote ? 'Meal check-in' : 'No entries',
      hasCompleteNutrition,
      mealChecks: mealTypes.reduce((count, meal) => count + (dayLog.meals[meal]?.reviewed ? 1 : 0), 0),
    }
  })
}

export function nutritionAverages(data: NutritionData, range: InsightRange, today = new Date()) {
  const days = nutritionHistory(data, range, today)
  const completeFoodDays = days.filter((day) => day.hasCompleteNutrition)
  const waterDays = days.filter((day) => day.water.length > 0)
  return {
    calorieAverage: average(completeFoodDays.map((day) => day.summary.caloriesKcal)),
    proteinAverage: average(completeFoodDays.map((day) => day.summary.proteinG)),
    waterAverage: average(waterDays.map((day) => day.waterMl)),
    completeFoodDays: completeFoodDays.length,
    loggedFoodDays: days.filter((day) => day.entries.length > 0).length,
    waterDays: waterDays.length,
    totalDays: days.length,
  }
}

function average(values: number[]) { return values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined }

export function progressPercent(value: number, goal: number) { return goal > 0 ? Math.min(100, Math.round(value / goal * 100)) : 0 }

export function makeFoodEntry(food: FoodItem, date: string, meal: MealType, amount: number, id: string, notes?: string): FoodLogEntry {
  return {
    id, date, meal, foodId: food.id, foodName: food.name, brand: food.brand, portionAmount: amount,
    servingAmount: food.servingAmount, servingUnit: food.servingUnit, nutritionBasis: food.nutritionBasis,
    ...scaleNutrition(food, amount), estimated: food.estimated, notes: notes?.trim() || undefined,
  }
}

export function copyGoals(goals: NutritionGoals): NutritionGoals { return { ...goals } }

