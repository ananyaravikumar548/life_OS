export const starterCategories = [
  'Dreams & Goals', 'Ideas to Explore', 'Career', 'Health & Fitness',
  'Academics', 'Personal Reflections', 'Random Thoughts',
] as const

export type ThinkCategory = typeof starterCategories[number] | string
export type Thought = {
  id: string
  title?: string
  content: string
  category?: ThinkCategory
  tags: string[]
  createdAt: string
  updatedAt: string
  pinned: boolean
  archived: boolean
  reviewDate?: string
  isGoal?: boolean
  sourceThoughtId?: string
}
export type ThinkSpaceData = { version: 1; thoughts: Thought[]; migrationComplete: boolean }
