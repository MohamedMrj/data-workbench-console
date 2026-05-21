export function isAuthRequired() {
  return /^true$/i.test(String(process.env.AUTH_REQUIRED || 'false'));
}

export function parseAllowedUserEmails() {
  return String(process.env.ALLOWED_USER_EMAILS || '')
    .split(/[,\n;]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email) {
  if (!isAuthRequired()) {
    return true;
  }

  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const allowed = parseAllowedUserEmails();
  return allowed.length > 0 && allowed.includes(normalized);
}

export function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
}

export function getMetadataStoreMode() {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'supabase'
    : 'file';
}
