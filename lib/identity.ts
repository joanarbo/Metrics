import type {
  NetlifyIdentityInitOptions,
  NetlifyIdentityUser,
} from "@/types/netlify-identity";

export type { NetlifyIdentityUser };

let latestOnUser: ((user: NetlifyIdentityUser | null) => void) | undefined;
let latestOnError: ((message: string) => void) | undefined;

function formatIdentityError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Error de autenticación";
}

function isLocalDevHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

/** `next dev --hostname 0.0.0.0` desde otro dispositivo en la red (misma API Identity que localhost). */
function isPrivateLanHostname(hostname: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function needsNetlifyIdentityApiUrlOverride(hostname: string): boolean {
  return isLocalDevHostname(hostname) || isPrivateLanHostname(hostname);
}

/**
 * En producción (mismo dominio que Netlify) el widget resuelve Identity solo.
 * `APIUrl` explícito solo en localhost vía `NEXT_PUBLIC_NETLIFY_SITE_URL`.
 */
function netlifyIdentityInitOptionsForCurrentHost(): NetlifyIdentityInitOptions | undefined {
  if (typeof window === "undefined") return undefined;
  if (!needsNetlifyIdentityApiUrlOverride(window.location.hostname)) {
    return undefined;
  }
  const apiUrl = netlifyIdentityApiUrlFromEnv();
  if (!apiUrl) {
    console.warn(
      "[Metrics Identity] Desarrollo (localhost o LAN): define NEXT_PUBLIC_NETLIFY_SITE_URL=https://tu-site.netlify.app en .env.local",
    );
    return undefined;
  }
  return { APIUrl: apiUrl };
}

export function getNetlifyIdentity() {
  if (typeof window === "undefined") return undefined;
  return window.netlifyIdentity;
}

export function openNetlifyLogin() {
  getNetlifyIdentity()?.open("login");
}

export function openNetlifyRecover() {
  getNetlifyIdentity()?.open("recover");
}

export function logoutAndReload() {
  const ni = getNetlifyIdentity();
  if (ni) {
    ni.logout();
  }
  window.location.reload();
}

function emitUser(user: NetlifyIdentityUser | null) {
  latestOnUser?.(user);
}

/** URL del endpoint Identity del site en Netlify (para `npm run dev` en localhost). */
export function netlifyIdentityApiUrlFromEnv(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_NETLIFY_SITE_URL?.trim();
  if (!raw) return undefined;
  const base = raw.replace(/\/$/, "");
  if (base.endsWith("/.netlify/identity")) return base;
  return `${base}/.netlify/identity`;
}

/**
 * Registers Identity listeners once and calls `init()` so the widget restores the session from localStorage.
 * Re-invocations from React remounts only refresh `onUser` and sync `currentUser()`.
 */
export function setupNetlifyIdentity(handlers: {
  onUser: (user: NetlifyIdentityUser | null) => void;
  onError?: (message: string) => void;
}): void {
  latestOnUser = handlers.onUser;
  latestOnError = handlers.onError;
  const ni = getNetlifyIdentity();
  if (!ni) {
    emitUser(null);
    return;
  }

  if (!window.__metricsIdentityListenersAttached) {
    window.__metricsIdentityListenersAttached = true;
    ni.on("init", (user) => {
      const u =
        (user as NetlifyIdentityUser | null | undefined) ?? ni.currentUser();
      emitUser(u ?? null);
    });
    ni.on("login", () => {
      emitUser(ni.currentUser());
      window.location.assign("/");
    });
    ni.on("logout", () => {
      emitUser(null);
    });
    ni.on("error", (err) => {
      latestOnError?.(formatIdentityError(err));
    });
    ni.init(netlifyIdentityInitOptionsForCurrentHost());
  }

  emitUser(ni.currentUser());
}

export function isNetlifyAuthSkipped(): boolean {
  const force = process.env.NEXT_PUBLIC_FORCE_NETLIFY_AUTH?.toLowerCase();
  if (force === "1" || force === "true" || force === "yes") {
    return false;
  }
  const skip = process.env.NEXT_PUBLIC_SKIP_NETLIFY_AUTH?.toLowerCase();
  if (skip === "1" || skip === "true" || skip === "yes") {
    return true;
  }
  /** `next run dev` → sin login por defecto (producción en Netlify sigue protegida). */
  return process.env.NODE_ENV === "development";
}
