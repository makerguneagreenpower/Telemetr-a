import { env } from 'cloudflare:workers';
import { clearTwitchStateCookie, twitchConfigured, twitchRequestState, twitchSessionCookie, type TwitchSession } from '../../../../lib/twitch-auth';

type TwitchTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; message?: string };
type TwitchUserResponse = { data?: Array<{ id?: string; login?: string; display_name?: string; profile_image_url?: string }> };

function redirectToRace(request: Request, message: string, sessionCookie?: string) {
    const headers = new Headers({ Location: new URL(`/carrera?twitch=${encodeURIComponent(message)}`, request.url).toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', clearTwitchStateCookie(request.url));
    if (sessionCookie) headers.append('Set-Cookie', sessionCookie);
    return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
    const config = { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, encryptionKey: env.TWITCH_TOKEN_ENCRYPTION_KEY };
    if (!twitchConfigured(config)) return redirectToRace(request, 'not_configured');

    const url = new URL(request.url);
    const error = url.searchParams.get('error');
    if (error) return redirectToRace(request, 'cancelled');
    const state = url.searchParams.get('state');
    const expectedState = twitchRequestState(request);
    if (!state || !expectedState || state !== expectedState) return redirectToRace(request, 'state_error');
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048) return redirectToRace(request, 'oauth_error');

    const redirectUri = new URL('/api/twitch/callback', url).toString();
    const form = new URLSearchParams({
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
    });

    try {
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form,
        });
        const token = await tokenResponse.json() as TwitchTokenResponse;
        if (!tokenResponse.ok || !token.access_token || !token.refresh_token || !token.expires_in) {
            return redirectToRace(request, 'oauth_error');
        }

        const userResponse = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Client-ID': config.clientId!, Authorization: `Bearer ${token.access_token}` },
        });
        const result = await userResponse.json() as TwitchUserResponse;
        const user = result.data?.[0];
        if (!userResponse.ok || !user?.id || !user.login || !user.display_name) return redirectToRace(request, 'profile_error');

        const session: TwitchSession = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: Date.now() + token.expires_in * 1000,
            user: {
                id: user.id,
                login: user.login,
                displayName: user.display_name,
                profileImageUrl: user.profile_image_url ?? '',
            },
        };
        const cookie = await twitchSessionCookie(session, config.encryptionKey!, request.url);
        return redirectToRace(request, 'connected', cookie);
    } catch {
        return redirectToRace(request, 'oauth_error');
    }
}
