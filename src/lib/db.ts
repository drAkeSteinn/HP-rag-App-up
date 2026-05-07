import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Resolve the database path relative to the project root
const dbDir = path.join(process.cwd(), 'db')
const dbPath = path.join(dbDir, 'custom.db')

// Ensure the db directory exists (SQLite can't create directories)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Build the datasource URL with absolute path
// Normalize backslashes to forward slashes for SQLite compatibility on Windows
const normalizedPath = dbPath.replace(/\\/g, '/')
const datasourceUrl = `file:${normalizedPath}`

console.log(`[DB] Database path: ${dbPath}`)
console.log(`[DB] Datasource URL: ${datasourceUrl}`)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    datasourceUrl,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
