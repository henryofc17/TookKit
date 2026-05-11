import { NextResponse } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'

// This endpoint runs the Prisma schema migration SQL to create all tables.
// It executes each statement individually because PostgreSQL doesn't allow
// multiple commands in a single prepared statement.
// It's safe to call multiple times - all statements are idempotent.

const MIGRATION_STATEMENTS: string[] = [
  // === CREATE TABLES ===
  `CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "TempEmail" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mail.tm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TempEmail_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "EmailMessage" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "intro" TEXT,
    "body" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "IptvList" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "channelCount" INTEGER NOT NULL DEFAULT 0,
    "groups" TEXT NOT NULL,
    "channels" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IptvList_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "CheckJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inputMode" TEXT NOT NULL DEFAULT 'url',
    "serverHost" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "bad" INTEGER NOT NULL DEFAULT 0,
    "timeout" INTEGER NOT NULL DEFAULT 0,
    "pendingLines" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "CheckJob_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "CheckResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "channelLogo" TEXT NOT NULL DEFAULT '',
    "channelGroup" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "WatchHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "channelLogo" TEXT NOT NULL DEFAULT '',
    "channelGroup" TEXT NOT NULL DEFAULT '',
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchHistory_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "PlayerState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playlistUrl" TEXT NOT NULL DEFAULT '',
    "currentChannel" TEXT NOT NULL,
    "selectedGroup" TEXT NOT NULL DEFAULT 'all',
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "useProxy" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerState_pkey" PRIMARY KEY ("id")
  )`,

  // === CREATE INDEXES ===
  `CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "TempEmail_sessionId_idx" ON "TempEmail"("sessionId")`,
  `CREATE INDEX IF NOT EXISTS "TempEmail_expiresAt_idx" ON "TempEmail"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "EmailMessage_emailId_idx" ON "EmailMessage"("emailId")`,
  `CREATE INDEX IF NOT EXISTS "IptvList_sessionId_idx" ON "IptvList"("sessionId")`,
  `CREATE INDEX IF NOT EXISTS "IptvList_sessionId_accessedAt_idx" ON "IptvList"("sessionId", "accessedAt")`,
  `CREATE INDEX IF NOT EXISTS "CheckJob_sessionId_idx" ON "CheckJob"("sessionId")`,
  `CREATE INDEX IF NOT EXISTS "CheckJob_status_idx" ON "CheckJob"("status")`,
  `CREATE INDEX IF NOT EXISTS "CheckJob_sessionId_status_idx" ON "CheckJob"("sessionId", "status")`,
  `CREATE INDEX IF NOT EXISTS "CheckResult_jobId_idx" ON "CheckResult"("jobId")`,
  `CREATE INDEX IF NOT EXISTS "CheckResult_jobId_status_idx" ON "CheckResult"("jobId", "status")`,
  `CREATE INDEX IF NOT EXISTS "CheckResult_status_idx" ON "CheckResult"("status")`,
  `CREATE INDEX IF NOT EXISTS "Favorite_sessionId_idx" ON "Favorite"("sessionId")`,
  `CREATE INDEX IF NOT EXISTS "WatchHistory_sessionId_idx" ON "WatchHistory"("sessionId")`,
  `CREATE INDEX IF NOT EXISTS "WatchHistory_watchedAt_idx" ON "WatchHistory"("watchedAt")`,
  `CREATE INDEX IF NOT EXISTS "WatchHistory_sessionId_watchedAt_idx" ON "WatchHistory"("sessionId", "watchedAt")`,
  `CREATE INDEX IF NOT EXISTS "PlayerState_sessionId_idx" ON "PlayerState"("sessionId")`,

  // === UNIQUE INDEXES (idempotent via DO block) ===
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Favorite_sessionId_channelUrl_key') THEN
      CREATE UNIQUE INDEX "Favorite_sessionId_channelUrl_key" ON "Favorite"("sessionId", "channelUrl");
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'PlayerState_sessionId_key') THEN
      CREATE UNIQUE INDEX "PlayerState_sessionId_key" ON "PlayerState"("sessionId");
    END IF;
  END $$`,

  // === FOREIGN KEYS (idempotent via DO block) ===
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TempEmail_sessionId_fkey') THEN
      ALTER TABLE "TempEmail" ADD CONSTRAINT "TempEmail_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailMessage_emailId_fkey') THEN
      ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "TempEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IptvList_sessionId_fkey') THEN
      ALTER TABLE "IptvList" ADD CONSTRAINT "IptvList_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CheckJob_sessionId_fkey') THEN
      ALTER TABLE "CheckJob" ADD CONSTRAINT "CheckJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CheckResult_jobId_fkey') THEN
      ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CheckJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Favorite_sessionId_fkey') THEN
      ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WatchHistory_sessionId_fkey') THEN
      ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlayerState_sessionId_fkey') THEN
      ALTER TABLE "PlayerState" ADD CONSTRAINT "PlayerState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
]

async function verifyTables(): Promise<Record<string, boolean>> {
  const tables = ['Session', 'TempEmail', 'EmailMessage', 'IptvList', 'CheckJob', 'CheckResult', 'Favorite', 'WatchHistory', 'PlayerState']
  const verification: Record<string, boolean> = {}

  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}'`
      ) as Array<{ count: bigint }>
      verification[table] = Number(result[0]?.count ?? 0) > 0
    } catch {
      verification[table] = false
    }
  }

  return verification
}

export async function POST(request: Request) {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json(
        { error: 'DATABASE_URL not configured' },
        { status: 500 }
      )
    }

    const results: Array<{ statement: number; success: boolean; error?: string }> = []
    let failedCount = 0

    // Execute each migration statement individually
    for (let i = 0; i < MIGRATION_STATEMENTS.length; i++) {
      try {
        await prisma.$executeRawUnsafe(MIGRATION_STATEMENTS[i])
        results.push({ statement: i + 1, success: true })
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ statement: i + 1, success: false, error: errMsg })
        failedCount++
        // Log but continue - some errors (like index already exists) are non-fatal
        console.warn(`Migration statement ${i + 1} failed (non-fatal):`, errMsg)
      }
    }

    // Verify tables exist
    const verification = await verifyTables()
    const allTablesExist = Object.values(verification).every(Boolean)

    return NextResponse.json({
      success: allTablesExist,
      message: allTablesExist
        ? 'All tables created and verified successfully'
        : `Migration completed with ${failedCount} statement failures. Check verification results.`,
      tables: verification,
      totalStatements: MIGRATION_STATEMENTS.length,
      failedStatements: failedCount,
      statementResults: results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Migration failed:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: message },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json(
        { error: 'DATABASE_URL not configured' },
        { status: 500 }
      )
    }

    const verification = await verifyTables()
    const existingCount = Object.values(verification).filter(Boolean).length

    return NextResponse.json({
      database: 'connected',
      tables: verification,
      totalTables: existingCount,
      expectedTables: Object.keys(verification).length,
      allTablesExist: existingCount === Object.keys(verification).length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Database check failed', details: message },
      { status: 500 }
    )
  }
}
