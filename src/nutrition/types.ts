export const mealTypes = ['Breakfast', 'Brunch', 'Lunch', 'Pre-workout', 'Post-workout', 'Dinner', 'Snacks'] as const
export type MealType = typeof mealTypes[number]
export type ServingUnit = 'g' | 'ml' | 'piece' | 'slice' | 'scoop' | 'cup' | 'serving'
export type NutritionBasis = 'serving' | '100g'

export type FoodItem = {
  id: string
  name: string
  brand?: string
  servingDescription: string
  servingAmount: number
  servingUnit: ServingUnit
  nutritionBasis: NutritionBasis
  caloriesKcal?: number
  proteinG?: number
  carbohydratesG?: number
  fatG?: number
  notes?: string
  estimated: boolean
}

export type FoodLogEntry = {
  id: string
  date: string
  meal: MealType
  foodId?: string
  foodName: string
  brand?: string
  portionAmount: number
  servingAmount: number
  servingUnit: ServingUnit
  nutritionBasis: NutritionBasis
  caloriesKcal?: number
  proteinG?: number
  carbohydratesG?: number
  fatG?: number
  notes?: string
  estimated: boolean
}

export type Meal = { reviewed?: boolean; note?: string }
export type DailyNutritionLog = { date: string; meals: Partial<Record<MealType, Meal>> }
export type WaterEntry = { id: string; date: string; amountMl: number; note?: string }
export type NutritionGoals = { caloriesKcal: number; proteinG: number; waterMl: number }
export type RecipeIngredient = { foodId: string; amount: number }
export type Recipe = { id: string; name: string; ingredients: RecipeIngredient[]; servingAmount: number; servingUnit: ServingUnit }
export type NutritionData = {
  version: 1
  goals: NutritionGoals
  foods: FoodItem[]
  entries: FoodLogEntry[]
  dailyLogs: DailyNutritionLog[]
  waterEntries: WaterEntry[]
  recipes: Recipe[]
}

export type InsightRange = '7d' | '4w' | 'all'
