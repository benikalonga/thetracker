import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  isProd: nodeEnv === 'production',
  consoleOrigins: (process.env.CONSOLE_URL ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  timezone: process.env.APP_TIMEZONE ?? 'UTC',
};

/** Refuse to start with configuration that would make the API insecure. */
export function assertConfig(): void {
  const problems: string[] = [];
  if (config.accessSecret.length < 32) problems.push('JWT_ACCESS_SECRET must be at least 32 characters.');
  if (config.refreshSecret.length < 32) problems.push('JWT_REFRESH_SECRET must be at least 32 characters.');
  if (config.accessSecret === config.refreshSecret) problems.push('JWT secrets must be different.');
  if (config.isProd && !process.env.CONSOLE_URL) problems.push('CONSOLE_URL is required in production.');
  if (problems.length) {
    problems.forEach((p) => console.error(`✖ ${p}`));
    process.exit(1);
  }
}
