import { env } from 'cloudflare:workers';
import { twitchConfigured, twitchStateCookie } from '../../../../lib/twitch-auth';

export async function GET(request: Request) {
    const config = { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, encryptionKey: env.TWITCH_TOKEN_ENCRYPTION_KEY };
    const url = new URL(request.url);
    if (!twitchConfigured(config)) {
        return Response.redirect(new URL('/carrera?twitch=not_configured', url), 302);
    }

    const state = crypto.randomUUID();
    const callback = new URL('/api/twitch/callback', url).toString();
    const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
    authorize.searchParams.set('client_id', config.clientId!);
    authorize.searchParams.set('redirect_uri', callback);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'user:read:follows');
    authorize.searchParams.set('state', state);
    const headers = new Headers({ Location: authorize.toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', twitchStateCookie(state, request.url));
    return new Response(null, { status: 302, headers });
}
