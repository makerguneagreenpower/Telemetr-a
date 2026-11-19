export type TwitchSession = {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: { id: string; login: string; displayName: string; profileImageUrl: string };
};

const SESSION_COOKIE = 'mgrt_twitch_session';
const STATE_COOKIE = 'mgrt_twitch_oauth_state';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function twitchConfigured(config: { clientId?: string; clientSecret?: string; encryptionKey?: string }) {
    return Boolean(config.clientId && config.clientSecret && config.encryptionKey && config.encryptionKey.length >= 32);
}

function base64UrlEncode(bytes: Uint8Array) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encryptionKey(secret: string) {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
    return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptTwitchSession(session: TwitchSession, secret: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await encryptionKey(secret);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(session)));
    return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptTwitchSession(value: string | null, secret: string): Promise<TwitchSession | null> {
    if (!value) return null;
    try {
        const [encodedIv, encodedCiphertext, extra] = value.split('.');
        if (!encodedIv || !encodedCiphertext || extra !== undefined) return null;
        const key = await encryptionKey(secret);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(encodedIv) }, key, base64UrlDecode(encodedCiphertext));
        const parsed: unknown = JSON.parse(decoder.decode(plaintext));
        if (!parsed || typeof parsed !== 'object') return null;
        const session = parsed as Partial<TwitchSession>;
        if (typeof session.accessToken !== 'string' || typeof session.refreshToken !== 'string' ||
            typeof session.expiresAt !== 'number' || !session.user || typeof session.user.id !== 'string' ||
            typeof session.user.login !== 'string' || typeof session.user.displayName !== 'string' ||
            typeof session.user.profileImageUrl !== 'string') return null;
        return session as TwitchSession;
    } catch {
        return null;
    }
}

function cookieOptions(requestUrl: string, maxAge: number) {
    const secure = new URL(requestUrl).protocol === 'https:';
    return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function twitchStateCookie(state: string, requestUrl: string) {
    return `${STATE_COOKIE}=${state}; ${cookieOptions(requestUrl, 600)}`;
}

export function clearTwitchStateCookie(requestUrl: string) {
    return `${STATE_COOKIE}=; ${cookieOptions(requestUrl, 0)}`;
}

export function twitchSessionCookie(session: TwitchSession, secret: string, requestUrl: string) {
    return encryptTwitchSession(session, secret).then(value => `${SESSION_COOKIE}=${value}; ${cookieOptions(requestUrl, 30 * 24 * 60 * 60)}`);
}

export function clearTwitchSessionCookie(requestUrl: string) {
    return `${SESSION_COOKIE}=; ${cookieOptions(requestUrl, 0)}`;
}

function cookieValue(request: Request, name: string) {
    const cookieHeader = request.headers.get('cookie') ?? '';
    for (const cookie of cookieHeader.split(';')) {
        const separator = cookie.indexOf('=');
        if (separator >= 0 && cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
    }
    return null;
}

export function twitchRequestState(request: Request) {
    return cookieValue(request, STATE_COOKIE);
}

export async function twitchRequestSession(request: Request, secret: string) {
    return decryptTwitchSession(cookieValue(request, SESSION_COOKIE), secret);
}
