/**
 * Emails permitidos (coma-separados). Por defecto solo el panel personal.
 * En Netlify: ALLOWED_CLERK_EMAILS=me@joanarbo.com
 */
const DEFAULT_ALLOWED = "me@joanarbo.com";

export function getAllowedClerkEmails(): string[] {
  const raw = process.env.ALLOWED_CLERK_EMAILS?.trim();
  const source = raw || DEFAULT_ALLOWED;
  return source
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedClerkEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getAllowedClerkEmails().includes(email.toLowerCase());
}
