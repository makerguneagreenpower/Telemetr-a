import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRealWorldEnvironment } from '../lib/real-world-environment';
import type { GeoPoint } from '../lib/circuits';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const route: GeoPoint[] = [
    { lat: 43.27, lng: -2.93 },
    { lat: 43.27, lng: -2.926 },
    { lat: 43.273, lng: -2.926 },
    { lat: 43.273, lng: -2.93 },
];

test('carga elevación, edificios y zonas OSM proyectados al circuito', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
        const url = new URL(String(input));
        calls.push(url.href);
        if (url.hostname === 'api.open-meteo.com') {
            const count = url.searchParams.get('latitude')!.split(',').length;
            return new Response(JSON.stringify({ elevation: Array.from({ length: count }, (_, index) => 500 + index / 10) }));
        }
        return new Response(JSON.stringify({ elements: [
            { id: 1, type: 'way', tags: { building: 'yes', 'building:levels': '3' }, geometry: [
                { lat: 43.2701, lon: -2.9299 }, { lat: 43.2701, lon: -2.9298 },
                { lat: 43.2702, lon: -2.9298 }, { lat: 43.2702, lon: -2.9299 },
                { lat: 43.2701, lon: -2.9299 },
            ] },
            { id: 2, type: 'way', tags: { leisure: 'park' }, geometry: [
                { lat: 43.271, lon: -2.929 }, { lat: 43.271, lon: -2.928 },
                { lat: 43.272, lon: -2.928 }, { lat: 43.272, lon: -2.929 },
            ] },
        ] }));
    }) as typeof fetch;

    const result = await fetchRealWorldEnvironment(route);
    assert.equal(result.terrain.columns, 17);
    assert.equal(result.terrain.rows, 17);
    assert.equal(result.terrain.points.length, 17 * 17);
    assert.equal(result.terrain.points[0].elevation, 500);
    assert.equal(result.buildings.length, 1);
    assert.equal(result.buildings[0].height, 9);
    assert.equal(result.surfaces.length, 1);
    assert.equal(result.surfaces[0].kind, 'grass');
    assert.ok(result.buildings[0].points.some(point => Math.abs(point.x) > 0 && Math.abs(point.z) > 0));
    assert.ok(calls.filter(url => url.includes('open-meteo.com')).length === 3);
    assert.ok(calls.some(url => url.includes('overpass-api.de')));
});

test('explica el límite de tamaño del área antes de consultar los servicios', async () => {
    globalThis.fetch = (async () => { throw new Error('No debe consultar'); }) as typeof fetch;
    await assert.rejects(
        fetchRealWorldEnvironment([
            { lat: 43.27, lng: -2.93 },
            { lat: 43.27, lng: -2.87 },
            { lat: 43.273, lng: -2.87 },
        ]),
        /hasta 4 km por lado/,
    );
});
