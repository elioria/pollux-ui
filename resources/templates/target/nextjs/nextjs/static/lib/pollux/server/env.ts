// SPEC-004 Next.js adapter — server-only Pollux environment access.
// The `server-only` import makes any client-side import a build error, so
// the upstream URL and bearer can never leak into browser chunks.
import 'server-only';

/** Documented default for POLLUX_API_TIMEOUT_MS (milliseconds). */
export const POLLUX_TIMEOUT_DEFAULT_MS = 10_000;
const TIMEOUT_MIN_MS = 1_000;
const TIMEOUT_MAX_MS = 60_000;

export type PolluxServerEnv = {
  /** Fixed upstream ORIGIN from POLLUX_API_URL (null when unset/invalid). */
  apiUrl: string | null;
  /** Bounded upstream timeout (default POLLUX_TIMEOUT_DEFAULT_MS). */
  timeoutMs: number;
  /**
   * DEV-ONLY fallback bearer forwarded upstream by the server proxy, used
   * ONLY when set AND the request carries no BFF access cookie. Production
   * deployments leave it unset and authenticate via the PKCE BFF cookies.
   */
  devBearer: string | null;
  /** Canonical public origin of this workspace (POLLUX_PUBLIC_ORIGIN). */
  publicOrigin: string | null;
  /** Cookie sealing / CSRF secret (POLLUX_SESSION_SECRET, server-only). */
  sessionSecret: string | null;
};

/**
 * Read and normalize the SPEC-003 server environment. Only the URL ORIGIN is
 * kept — upstream paths are always rebuilt from validated segments, so the
 * proxy can never be pointed at an arbitrary upstream path.
 */
export function polluxServerEnv(): PolluxServerEnv {
  let apiUrl: string | null = null;
  try {
    const parsed = new URL(process.env.POLLUX_API_URL ?? '');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      apiUrl = parsed.origin;
    }
  } catch {
    apiUrl = null;
  }

  const rawTimeout = Number(process.env.POLLUX_API_TIMEOUT_MS ?? '');
  const timeoutMs =
    Number.isFinite(rawTimeout) &&
    rawTimeout >= TIMEOUT_MIN_MS &&
    rawTimeout <= TIMEOUT_MAX_MS
      ? Math.trunc(rawTimeout)
      : POLLUX_TIMEOUT_DEFAULT_MS;

  const bearer = process.env.POLLUX_DEV_BEARER ?? '';
  const publicOrigin = (process.env.POLLUX_PUBLIC_ORIGIN ?? '').replace(
    /\/+$/,
    ''
  );
  const sessionSecret = process.env.POLLUX_SESSION_SECRET ?? '';
  return {
    apiUrl,
    timeoutMs,
    devBearer: bearer.length > 0 ? bearer : null,
    publicOrigin: publicOrigin.length > 0 ? publicOrigin : null,
    sessionSecret: sessionSecret.length > 0 ? sessionSecret : null,
  };
}
