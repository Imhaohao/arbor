export const WAITLIST_ROLES = ["buyer", "specialist"] as const;
export type WaitlistRole = (typeof WAITLIST_ROLES)[number];

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailCheck = { ok: true; email: string } | { ok: false; reason: string };

/** Trims and lowercases so the same inbox can only hold one place in line. */
export function normalizeEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: false, reason: "Enter your email address." };
  if (email.length > MAX_EMAIL_LENGTH) return { ok: false, reason: "That email address is too long." };
  if (!EMAIL_SHAPE.test(email)) return { ok: false, reason: "That doesn't look like an email address." };
  return { ok: true, email };
}

export function isWaitlistRole(value: string): value is WaitlistRole {
  return (WAITLIST_ROLES as readonly string[]).includes(value);
}
