import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptTwitchSession, encryptTwitchSession, twitchConfigured, type TwitchSession } from '../lib/twitch-auth';

const session: TwitchSession = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 1_800_000_000_000,
    user: { id: '123', login: 'mgrt', displayName: 'MGRT', profileImageUrl: '' },
};

test('cifra la sesión OAuth y solo la descifra con la clave correcta', async () => {
    const encrypted = await encryptTwitchSession(session, 'clave-de-pruebas-de-al-menos-32-caracteres');
    assert.notEqual(encrypted, JSON.stringify(session));
    assert.deepEqual(await decryptTwitchSession(encrypted, 'clave-de-pruebas-de-al-menos-32-caracteres'), session);
    assert.equal(await decryptTwitchSession(encrypted, 'otra-clave-de-pruebas-de-al-menos-32-caracteres'), null);
});

test('rechaza cookies OAuth mal formadas', async () => {
    assert.equal(await decryptTwitchSession('cookie-malformada', 'clave-de-pruebas-de-al-menos-32-caracteres'), null);
    assert.equal(await decryptTwitchSession(null, 'clave-de-pruebas-de-al-menos-32-caracteres'), null);
});

test('requiere ID, secreto y clave de cifrado suficientemente larga', () => {
    assert.equal(twitchConfigured({ clientId: 'id', clientSecret: 'secret', encryptionKey: 'a'.repeat(32) }), true);
    assert.equal(twitchConfigured({ clientId: 'id', clientSecret: 'secret', encryptionKey: 'short' }), false);
    assert.equal(twitchConfigured({ clientId: 'id', clientSecret: 'secret' }), false);
});
