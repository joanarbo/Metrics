/**
 * Misma lógica en middleware y cliente: sin login en `next dev` salvo que fuerces auth.
 *
 * `NEXT_PUBLIC_FORCE_CLERK_AUTH=1` — exige Clerk también en desarrollo.
 * `NEXT_PUBLIC_SKIP_CLERK_AUTH=1` — desactiva protección (p. ej. preview sin claves).
 */
export function isClerkAuthSkipped(): boolean {
  const force = process.env.NEXT_PUBLIC_FORCE_CLERK_AUTH?.toLowerCase();
  if (force === "1" || force === "true" || force === "yes") {
    return false;
  }
  const skip = process.env.NEXT_PUBLIC_SKIP_CLERK_AUTH?.toLowerCase();
  if (skip === "1" || skip === "true" || skip === "yes") {
    return true;
  }
  return process.env.NODE_ENV === "development";
}
