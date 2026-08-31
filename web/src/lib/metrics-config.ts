export class MetricsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricsConfigurationError";
  }
}

interface MetricsDatabaseEnvironment {
  metricsDatabaseUrl?: string;
  applicationDatabaseUrl?: string;
  nodeEnv?: string;
}

/**
 * Production must never fall back to the application's write-capable URL.
 * The development fallback exists only to make local UI work straightforward.
 */
export function resolveMetricsDatabaseUrl({
  metricsDatabaseUrl,
  applicationDatabaseUrl,
  nodeEnv,
}: MetricsDatabaseEnvironment): string {
  const configuredUrl = metricsDatabaseUrl?.trim();
  if (configuredUrl) return configuredUrl;

  if (nodeEnv === "production") {
    throw new MetricsConfigurationError(
      "METRICS_DATABASE_URL is required for production admin metrics.",
    );
  }

  const developmentUrl = applicationDatabaseUrl?.trim();
  if (!developmentUrl) {
    throw new MetricsConfigurationError(
      "Set METRICS_DATABASE_URL (or DATABASE_URL outside production) to load admin metrics.",
    );
  }
  return developmentUrl;
}
