import { mealTypes } from './types'
import type { DailyNutritionLog, FoodItem, FoodLogEntry, MealType, NutritionData, NutritionGoals, Recipe, ServingUnit, WaterEntry } from './types'

const STORAGE_KEY = 'life-os.nutrition.v1'
export const defaultGoals: NutritionGoals = { caloriesKcal: 2500, proteinG: 80, waterMl: 2000 }
const servingUnits: ServingUnit[] = ['g', 'ml', 'piece', 'slice', 'scoop', 'cup', 'serving']

export function createNutritionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined }
function unit(value: unknown): value is ServingUnit { return typeof value === 'string' && servingUnits.includes(value as ServingUnit) }
function meal(value: unknown): value is MealType { return typeof value === 'string' && mealTypes.includes(value as MealType) }

function parseFood(value: unknown): FoodItem | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim() || !unit(value.servingUnit)) return undefined
  const amount = number(value.servingAmount)
  if (!amount || amount <= 0) return undefined
  return {
    id: value.id, name: value.name.trim(), brand: text(value.brand), servingDescription: text(value.servingDescription) ?? `${amount} ${value.servingUnit}`,
    servingAmount: amount, servingUnit: value.servingUnit,
    nutritionBasis: value.nutritionBasis === '100g' ? '100g' : 'serving',
    caloriesKcal: number(value.caloriesKcal), proteinG: number(value.proteinG), carbohydratesG: number(value.carbohydratesG), fatG: number(value.fatG),
    notes: text(value.notes), estimated: Boolean(value.estimated),
  }
}

function parseEntry(value: unknown): FoodLogEntry | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string' || !meal(value.meal) || typeof value.foodName !== 'string' || !unit(value.servingUnit)) return undefined
  const portionAmount = number(value.portionAmount)
  const servingAmount = number(value.servingAmount)
  if (!portionAmount || portionAmount <= 0 || !servingAmount || servingAmount <= 0) return undefined
  return {
    id: value.id, date: value.date, meal: value.meal, foodId: text(value.foodId), foodName: value.foodName.trim(), brand: text(value.brand),
    portionAmount, servingAmount, servingUnit: value.servingUnit, nutritionBasis: value.nutritionBasis === '100g' ? '100g' : 'serving', caloriesKcal: number(value.caloriesKcal), proteinG: number(value.proteinG),
    carbohydratesG: number(value.carbohydratesG), fatG: number(value.fatG), notes: text(value.notes), estimated: Boolean(value.estimated),
  }
}

function parseDailyLog(value: unknown): DailyNutritionLog | undefined {
  if (!isRecord(value) || typeof value.date !== 'string') return undefined
  const meals: DailyNutritionLog['meals'] = {}
  if (isRecord(value.meals)) for (const key of mealTypes) {
    const item = value.meals[key]
    if (isRecord(item)) meals[key] = { reviewed: Boolean(item.reviewed), note: text(item.note) }
  }
  return { date: value.date, meals }
}

function parseWater(value: unknown): WaterEntry | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string') return undefined
  const amountMl = number(value.amountMl)
  if (!amountMl || amountMl <= 0) return undefined
  return { id: value.id, date: value.date, amountMl, note: text(value.note) }
}

function parseRecipe(value: unknown): Recipe | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !unit(value.servingUnit)) return undefined
  const servingAmount = number(value.servingAmount)
  if (!servingAmount || servingAmount <= 0 || !Array.isArray(value.ingredients)) return undefined
  const ingredients = value.ingredients.filter(isRecord).flatMap((item) => typeof item.foodId === 'string' && number(item.amount) ? [{ foodId: item.foodId, amount: number(item.amount)! }] : [])
  return { id: value.id, name: value.name.trim(), servingAmount, servingUnit: value.servingUnit, ingredients }
}

export function emptyNutritionData(): NutritionData {
  return { version: 1, goals: defaultGoals, foods: [], entries: [], dailyLogs: [], waterEntries: [], recipes: [] }
}

export function loadNutritionData(): NutritionData {
  if (typeof window === 'undefined') return emptyNutritionData()
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return emptyNutritionData()
    const value: unknown = JSON.parse(stored)
    if (!isRecord(value) || value.version !== 1) return emptyNutritionData()
    const goals = isRecord(value.goals) ? value.goals : {}
    const validFoods = Array.isArray(value.foods) ? value.foods.map(parseFood).filter((item): item is FoodItem => Boolean(item)) : []
    return {
      version: 1,
      goals: {
        caloriesKcal: number(goals.caloriesKcal) || defaultGoals.caloriesKcal,
        proteinG: number(goals.proteinG) || defaultGoals.proteinG,
        waterMl: number(goals.waterMl) || defaultGoals.waterMl,
      },
      foods: validFoods,
      entries: Array.isArray(value.entries) ? value.entries.map(parseEntry).filter((item): item is FoodLogEntry => Boolean(item)) : [],
      dailyLogs: Array.isArray(value.dailyLogs) ? value.dailyLogs.map(parseDailyLog).filter((item): item is DailyNutritionLog => Boolean(item)) : [],
      waterEntries: Array.isArray(value.waterEntries) ? value.waterEntries.map(parseWater).filter((item): item is WaterEntry => Boolean(item)) : [],
      recipes: Array.isArray(value.recipes) ? value.recipes.map(parseRecipe).filter((item): item is Recipe => Boolean(item)) : [],
    }
  } catch {
    return emptyNutritionData()
  }
}

export function saveNutritionData(data: NutritionData) {
  if (typeof window === 'undefined') return false
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 1 })); return true } catch { return false }
}

