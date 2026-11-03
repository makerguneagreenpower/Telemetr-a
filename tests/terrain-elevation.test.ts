import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchTerrainHeights } from '../lib/terrain-elevation';
import { createCircuitRuntime, geoToVertices, type GeoPoint } from '../lib/circuits';

// The network is never used: fetch is replaced by a fake terrain service.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
function fakeTerrain(height: (lat: number, lng: number) => number) {
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
        const url = new URL(String(input)); calls.push(url.href);
        const lats = url.searchParams.get('latitude')!.split(',').map(Number), lngs = url.searchParams.get('longitude')!.split(',').map(Number);
        return new Response(JSON.stringify({ elevation: lats.map((lat, i) => height(lat, lngs[i])) }), { status: 200 });
    }) as typeof fetch;
    return calls;
}
function loop(corners: [number, number][], perSide = 20): GeoPoint[] {
    return corners.flatMap((p, i) => { const q = corners[(i + 1) % corners.length]; return Array.from({ length: perSide }, (_, k) => ({ lat: p[0] + (q[0] - p[0]) * k / perSide, lng: p[1] + (q[1] - p[1]) * k / perSide })); });
}
const runtimeOf = (points: GeoPoint[]) => createCircuitRuntime({ version: 1, id: 't', name: 't', competition: '', width: 6, source: 'map', vertices: geoToVertices(points), updatedAt: 't' });

test('una ladera suave se traslada al circuito', async () => {
    const calls = fakeTerrain(lat => 600 + (lat - 43.27) * 20000);   // ~0.18 m por metro hacia el norte → unos 60 m en 330 m
    const result = await fetchTerrainHeights(loop([[43.27, -2.93], [43.27, -2.926], [43.273, -2.926], [43.273, -2.93]]));
    assert.ok(calls.length >= 1 && calls.every(c => c.startsWith('https://api.open-meteo.com/v1/elevation')));
    assert.ok(result.range > 30 && result.range < 70, `desnivel ${result.range}`);
    const track = runtimeOf(result.points);
    assert.ok(track.elevation.hasElevation && track.elevation.maxGrade <= .25);
});

test('el ruido de celdas del modelo no crea rampas falsas en terreno llano', async () => {
    fakeTerrain((lat, lng) => 660 + (Math.floor(lat * 1100) + Math.floor(lng * 1100)) % 2 * 4);   // escalones de 4 m cada ~90 m
    const result = await fetchTerrainHeights(loop([[40.4168, -3.7038], [40.4168, -3.7], [40.419, -3.7], [40.419, -3.7038]]));
    assert.ok(runtimeOf(result.points).elevation.maxGrade < .1, 'el suavizado elimina los escalones');
});

test('un terreno demasiado empinado se suaviza hasta ser válido', async () => {
    fakeTerrain(lat => (lat - 43.27) * 200000);   // ~180 % de pendiente
    const result = await fetchTerrainHeights(loop([[43.27, -2.93], [43.27, -2.926], [43.273, -2.926], [43.273, -2.93]])).catch(error => error as Error);
    if (result instanceof Error) assert.match(result.message, /empinado/);
    else { assert.equal(result.softened, true); assert.ok(runtimeOf(result.points).elevation.maxGrade <= .25); }
});

test('divide en lotes de 100 puntos como exige el servicio', async () => {
    const calls = fakeTerrain(() => 100);
    await fetchTerrainHeights(loop([[43.2, -2.95], [43.2, -2.9], [43.23, -2.9], [43.23, -2.95]], 200));
    for (const call of calls) assert.ok(new URL(call).searchParams.get('latitude')!.split(',').length <= 100);
    assert.ok(calls.length >= 2);
});

test('informa de forma clara si el servicio falla', async () => {
    globalThis.fetch = (async () => new Response('', { status: 429 })) as typeof fetch;
    await assert.rejects(fetchTerrainHeights(loop([[43.27, -2.93], [43.27, -2.926], [43.273, -2.926], [43.273, -2.93]])), /demasiadas peticiones/);
    globalThis.fetch = (async () => new Response(JSON.stringify({ elevation: [1, 'x'] }), { status: 200 })) as typeof fetch;
    await assert.rejects(fetchTerrainHeights(loop([[43.27, -2.93], [43.27, -2.926], [43.273, -2.926], [43.273, -2.93]])), /datos válidos/);
});
