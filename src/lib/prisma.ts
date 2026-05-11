import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prisma: PrismaClient

// Check if DATABASE_URL is configured
const hasDatabaseUrl = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('placeholder')

if (hasDatabaseUrl) {
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
  
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }
} else {
  // Create a dummy client that will throw if used without a real DB
  // This allows the app to start without a database connection
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['error'],
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }
}

export { prisma, hasDatabaseUrl }
