// Minimal shapes of the Cloudflare bindings we use, so the code can be tested without Cloudflare's types.

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
}

export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** D1 database with the registrations table (see migrations/). */
  DB?: D1Like;
  /** Secrets: set in the Cloudflare dashboard, never in the repository. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** At least 32 random characters. Protects the organiser export. */
  ADMIN_TOKEN?: string;
  /** Optional Cloudflare Turnstile bot check; enforced once set. */
  TURNSTILE_SECRET?: string;
  TURNSTILE_API_BASE?: string;
  /** Only for tests and local development (a fake Stripe server). */
  STRIPE_API_BASE?: string;
}
