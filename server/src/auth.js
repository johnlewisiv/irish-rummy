// Supabase verifies the bearer with its Auth service. A decoded JWT alone is
// never an identity proof, and Google details are never accepted from the client.
import { Err } from './game.js';

export class AuthError extends Err {
  constructor(message = 'Sign in with Google to continue.', code = 'AUTH_REQUIRED') {
    super(message); this.code = code;
  }
}
export function publicProfile(profile) {
  return { id: profile.id, displayName: profile.displayName, avatarId: profile.avatarId,
    photoUrl: profile.photoUrl || null, useGooglePhoto: !!profile.useGooglePhoto };
}
function googlePhoto(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) ? url.href : null;
  } catch { return null; }
}
export function createAuth({ env = process.env, fetcher = fetch } = {}) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
  let keyRole = null;
  try { keyRole = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url')).role; } catch {}
  const enabled = !!(url.startsWith('https://') && publishableKey && !publishableKey.startsWith('sb_secret_') && keyRole !== 'service_role');
  return {
    enabled,
    config: { enabled, ...(enabled ? { url, publishableKey } : {}) },
    async verify(accessToken) {
      if (!enabled) throw new AuthError('Google sign-in is not configured yet.', 'AUTH_UNAVAILABLE');
      if (typeof accessToken !== 'string' || accessToken.length > 16000) throw new AuthError('Your Google session is invalid. Sign in again.', 'AUTH_EXPIRED');
      let response;
      try {
        response = await fetcher(`${url}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) });
      } catch { throw new AuthError('Sign-in could not be checked. Please try again.', 'AUTH_UNAVAILABLE'); }
      if (!response.ok) throw new AuthError('Your Google session has expired. Sign in again.', 'AUTH_EXPIRED');
      const user = await response.json();
      let claims;
      try { claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url')); } catch { throw new AuthError('Your session is invalid.', 'AUTH_EXPIRED'); }
      if (!user?.id || claims.sub !== user.id || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()
        || user.is_anonymous || !user.identities?.some((identity) => identity.provider === 'google')) {
        throw new AuthError('Use a verified Google account to sign in.', 'AUTH_REQUIRED');
      }
      return { id: user.id, displayName: String(user.user_metadata?.full_name || user.user_metadata?.name || 'Player').trim().slice(0, 20) || 'Player',
        photoUrl: googlePhoto(user.user_metadata?.avatar_url || user.user_metadata?.picture), expiresAt: claims.exp * 1000 };
    },
  };
}
