/**
 * Password policy for staff and client logins — shared by the browser (live guidance) and the
 * server (enforcement). Supabase Auth's own "Minimum password length" must not be higher.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt (used by Supabase Auth) ignores anything longer

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with letters and at least one number.`;

export const passwordChecks = (password: string) => [
  { ok: password.length >= MIN_PASSWORD_LENGTH, label: `${MIN_PASSWORD_LENGTH}+ characters` },
  { ok: /[a-zA-Z]/.test(password), label: "A letter" },
  { ok: /\d/.test(password), label: "A number" },
  { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: "Upper & lower case (recommended)", optional: true },
  { ok: /[^a-zA-Z0-9]/.test(password), label: "A symbol (recommended)", optional: true },
];

/** Returns an error message, or null when the password meets the policy. */
export function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Mix letters and at least one number.";
  return null;
}
