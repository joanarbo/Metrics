export interface NetlifyIdentityUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export type NetlifyIdentityInitOptions = {
  /** P. ej. `https://tu-app.netlify.app/.netlify/identity` (necesario en localhost). */
  APIUrl?: string;
};

export interface NetlifyIdentity {
  init(opts?: NetlifyIdentityInitOptions): void;
  open(view: "login" | "signup" | "recover"): void;
  logout(): void;
  currentUser(): NetlifyIdentityUser | null;
  on(
    event: "init" | "login" | "logout" | "close" | "error",
    cb: (...args: unknown[]) => void,
  ): void;
}

declare global {
  interface Window {
    netlifyIdentity?: NetlifyIdentity;
    /** Set by Metrics app so Identity listeners are only attached once (Strict Mode / remounts). */
    __metricsIdentityListenersAttached?: boolean;
  }
}

export {};
