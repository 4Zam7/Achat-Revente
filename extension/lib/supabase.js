// ─── SUPABASE (REST, sans dépendance) ───────────────────────────────────────
// Mêmes identifiants publics que l'app : la sécurité repose sur la session
// de l'utilisateur et les règles RLS de la base.
export const SUPABASE_URL = 'https://dqsrqdmbqlyvwhfrdjvk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc3JxZG1icWx5dndoZnJkanZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDY2NTMsImV4cCI6MjA5MzQ4MjY1M30.JNl6up-Nn49rT9m9XXEqvd3e0dkDhgFh1-02vmyIR7g';

async function getSession() {
  const { session } = await chrome.storage.local.get('session');
  return session || null;
}

async function saveAuth(json) {
  const session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    email: json.user ? json.user.email : undefined,
  };
  const prev = await getSession();
  if (!session.email && prev) session.email = prev.email;
  await chrome.storage.local.set({ session });
  return session;
}

async function authRequest(grant, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.msg || 'Connexion refusée');
  return saveAuth(json);
}

export const login = (email, password) => authRequest('password', { email, password });

export async function logout() {
  await chrome.storage.local.remove('session');
}

export async function isLoggedIn() {
  return !!(await getSession());
}

export async function currentEmail() {
  const s = await getSession();
  return s ? s.email : null;
}

async function accessToken() {
  let s = await getSession();
  if (!s) throw new Error('Non connecté');
  if (s.expires_at - 60000 < Date.now()) {
    try {
      s = await authRequest('refresh_token', { refresh_token: s.refresh_token });
    } catch (e) {
      await logout();
      throw new Error('Session expirée, reconnecte-toi');
    }
  }
  return s.access_token;
}

// Appel REST PostgREST : rest('articles?select=*', { method, body })
export async function rest(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && json.message) || `Erreur Supabase ${res.status}`);
  return json;
}
