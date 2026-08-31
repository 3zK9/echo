import "server-only";

import { PrismaClient } from "@prisma/client";
import { resolveMetricsDatabaseUrl } from "@/lib/metrics-config";

const METRICS_WINDOW_DAYS = 30;

type MetricsGlobal = typeof globalThis & {
  echoMetricsPrisma?: PrismaClient;
  echoMetricsDatabaseUrl?: string;
};

type ProductTotalsRow = {
  users: bigint | number;
  originalEchoes: bigint | number;
  replies: bigint | number;
  reposts: bigint | number;
  likes: bigint | number;
  activeUsers7d: bigint | number;
  activeUsers30d: bigint | number;
};

type DailyActivityRow = {
  day: Date | string;
  registeredUsers: bigint | number;
  activeUsers: bigint | number;
  originalEchoes: bigint | number;
  replies: bigint | number;
  reposts: bigint | number;
  likes: bigint | number;
};

export interface ProductTotals {
  users: number;
  originalEchoes: number;
  replies: number;
  reposts: number;
  likes: number;
  activeUsers7d: number;
  activeUsers30d: number;
}

export interface DailyActivity {
  date: string;
  registeredUsers: number;
  activeUsers: number;
  originalEchoes: number;
  replies: number;
  reposts: number;
  likes: number;
}

export interface AdminProductMetrics {
  totals: ProductTotals;
  daily: DailyActivity[];
  generatedAt: string;
  windowDays: number;
}

function metricsClient(): PrismaClient {
  const databaseUrl = resolveMetricsDatabaseUrl({
    metricsDatabaseUrl: process.env.METRICS_DATABASE_URL,
    applicationDatabaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
  const metricsGlobal = globalThis as MetricsGlobal;

  if (
    !metricsGlobal.echoMetricsPrisma ||
    metricsGlobal.echoMetricsDatabaseUrl !== databaseUrl
  ) {
    metricsGlobal.echoMetricsPrisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
    metricsGlobal.echoMetricsDatabaseUrl = databaseUrl;
  }

  return metricsGlobal.echoMetricsPrisma;
}

function safeCount(value: bigint | number): number {
  const count = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Metric count exceeds the supported integer range.");
  }
  return count;
}

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Read only aggregate views. This module never selects user/content rows and
 * intentionally exposes no identifiers, message data, OAuth data, or keys.
 */
export async function loadAdminProductMetrics(): Promise<AdminProductMetrics> {
  const client = metricsClient();

  const totalsRows = await client.$queryRaw<ProductTotalsRow[]>`
    SELECT
      "users",
      "originalEchoes",
      "replies",
      "reposts",
      "likes",
      "activeUsers7d",
      "activeUsers30d"
    FROM "AdminProductTotals"
  `;

  const dailyRows = await client.$queryRaw<DailyActivityRow[]>`
    SELECT
      "day",
      "registeredUsers",
      "activeUsers",
      "originalEchoes",
      "replies",
      "reposts",
      "likes"
    FROM "AdminDailyActivity"
    ORDER BY "day" DESC
    LIMIT ${METRICS_WINDOW_DAYS}
  `;

  const totals = totalsRows[0];
  if (!totals) throw new Error("AdminProductTotals returned no rows.");

  return {
    totals: {
      users: safeCount(totals.users),
      originalEchoes: safeCount(totals.originalEchoes),
      replies: safeCount(totals.replies),
      reposts: safeCount(totals.reposts),
      likes: safeCount(totals.likes),
      activeUsers7d: safeCount(totals.activeUsers7d),
      activeUsers30d: safeCount(totals.activeUsers30d),
    },
    daily: dailyRows.map((row) => ({
      date: isoDate(row.day),
      registeredUsers: safeCount(row.registeredUsers),
      activeUsers: safeCount(row.activeUsers),
      originalEchoes: safeCount(row.originalEchoes),
      replies: safeCount(row.replies),
      reposts: safeCount(row.reposts),
      likes: safeCount(row.likes),
    })),
    generatedAt: new Date().toISOString(),
    windowDays: METRICS_WINDOW_DAYS,
  };
}
