// Prisma is kept for future use but not actively imported by any route.
// Lazy initialization to prevent build/deploy failures when DATABASE_URL is unset.

type PrismaClientType = import('@prisma/client').PrismaClient

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined
}

let db: PrismaClientType | undefined

try {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = require('@prisma/client')
    db =
      globalForPrisma.prisma ??
      new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query'] : [],
      })
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
  }
} catch {
  // Prisma client not available — app works without database
}

export { db }
