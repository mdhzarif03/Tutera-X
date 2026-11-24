const configuredUrl = process.env.TEST_DATABASE_URL;

function isLoopbackTestDatabase(value: string | undefined): value is string {
  if (!value || value === process.env.DATABASE_URL) return false;
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""));
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    return loopback && /test/i.test(databaseName);
  } catch {
    return false;
  }
}

export const testDatabaseUrl = isLoopbackTestDatabase(configuredUrl) ? configuredUrl : null;
export const testDatabaseSkipReason = !configuredUrl
  ? "TEST_DATABASE_URL is not set"
  : "TEST_DATABASE_URL must target a loopback database whose name contains 'test', and must differ from DATABASE_URL";

export function configureTestDatabase(): void {
  if (!testDatabaseUrl) throw new Error(testDatabaseSkipReason);
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.APP_URL = "https://integration.invalid";
  delete process.env.NISHCHIT_API_KEY;
}
