import 'dotenv/config'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI?.trim()
const dbName = process.env.MONGODB_DB_NAME?.trim()

export const mongoConfigured = Boolean(uri && dbName)
export const mongoClient = uri ? new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }) : undefined

let connection: Promise<void> | undefined
export async function connectMongo() {
  if (!mongoConfigured || !mongoClient || !dbName) throw new Error('MongoDB is not configured. Set MONGODB_URI and MONGODB_DB_NAME in .env.')
  connection ??= mongoClient.connect().then(() => undefined).catch((error: unknown) => {
    connection = undefined
    throw error
  })
  await connection
}

export function getDb() {
  if (!mongoClient || !dbName) throw new Error('MongoDB is not configured.')
  return mongoClient.db(dbName)
}

export async function checkMongo() {
  if (!mongoConfigured || !mongoClient) return false
  try { await connectMongo(); await getDb().command({ ping: 1 }); return true } catch { return false }
}
