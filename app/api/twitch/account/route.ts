import { env } from 'cloudflare:workers';
import {
    clearTwitchSessionCookie,
    twitchConfigured,
    twitchRequestSession,
    twitchSessionCookie,
} from '../../../../lib/twitch-auth';

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };
type StreamsResponse = { data?: Array<{ id: string; user_id: string; user_login: string; user_name: string; game_name: string; title: string; viewer_count: number; started_at: string; thumbnail_url: string }> };

function json(data: unknown, status = 200, headers?: HeadersInit) {
    return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...Object.fromEntries(new Headers(headers).entries()) } });
}

export async function GET(request: Request) {
    const config = { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, encryptionKey: env.TWITCH_TOKEN_ENCRYPTION_KEY };
    if (!twitchConfigured(config)) return json({ configured: false, user: null, streams: [] });

    let session = await twitchRequestSession(request, config.encryptionKey!);
    if (!session) return json({ configured: true, user: null, streams: [] });

    const responseHeaders = new Headers();
    try {
        if (session.expiresAt <= Date.now() + 60_000) {
            const refreshed = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: session.refreshToken,
                    client_id: config.clientId!,
                    client_secret: config.clientSecret!,
                }),
            });
            const refreshedToken = await refreshed.json() as TokenResponse;
            if (!refreshed.ok || !refreshedToken.access_token || !refreshedToken.refresh_token || !refreshedToken.expires_in) {
                responseHeaders.append('Set-Cookie', clearTwitchSessionCookie(request.url));
                return json({ configured: true, user: null, streams: [], error: 'La sesión de Twitch ha caducado. Vuelve a iniciar sesión.' }, 401, responseHeaders);
            }
            session = {
                ...session,
                accessToken: refreshedToken.access_token,
                refreshToken: refreshedToken.refresh_token,
                expiresAt: Date.now() + refreshedToken.expires_in * 1000,
            };
            responseHeaders.append('Set-Cookie', await twitchSessionCookie(session, config.encryptionKey!, request.url));
        }

        const headers = { 'Client-ID': config.clientId!, Authorization: `Bearer ${session.accessToken}` };
        const [ownResponse, followedResponse] = await Promise.all([
            fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(session.user.id)}`, { headers }),
            fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${encodeURIComponent(session.user.id)}&first=100`, { headers }),
        ]);
        if (!ownResponse.ok || !followedResponse.ok) {
            return json({ configured: true, user: session.user, streams: [], error: 'Twitch no pudo cargar los directos. Comprueba los permisos de la aplicación.' }, 502, responseHeaders);
        }
        const own = await ownResponse.json() as StreamsResponse;
        const followed = await followedResponse.json() as StreamsResponse;
        const streams = new Map<string, NonNullable<StreamsResponse['data']>[number]>();
        for (const stream of [...(own.data ?? []), ...(followed.data ?? [])]) streams.set(stream.user_id, stream);
        return json({ configured: true, user: session.user, streams: [...streams.values()] }, 200, responseHeaders);
    } catch {
        return json({ configured: true, user: session.user, streams: [], error: 'No se pudo conectar con Twitch. Inténtalo de nuevo.' }, 502, responseHeaders);
    }
}

export async function POST(request: Request) {
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origen no permitido.' }, 403);
    const config = { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, encryptionKey: env.TWITCH_TOKEN_ENCRYPTION_KEY };
    const headers = new Headers({ 'Set-Cookie': clearTwitchSessionCookie(request.url) });
    let revoked = false;
    if (twitchConfigured(config)) {
        const session = await twitchRequestSession(request, config.encryptionKey!);
        if (session) {
            try {
                const response = await fetch('https://id.twitch.tv/oauth2/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ client_id: config.clientId!, token: session.accessToken }),
                });
                revoked = response.ok;
            } catch {
                revoked = false;
            }
        }
    }
    return json({ ok: true, revoked }, 200, headers);
}
