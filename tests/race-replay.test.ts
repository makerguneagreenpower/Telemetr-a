import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceWorld } from '../lib/race-engine';
import { DEMO_CIRCUIT, DEMO_TRACK } from '../lib/circuits';
import { validateReplayDocument } from '../lib/race-replay';

function document() {
    const world = createRaceWorld(DEMO_TRACK);
    return {
        eventName: 'Navarra 2026',
        runName: 'Prácticas 1',
        eventDate: '2026-11-17',
        circuitId: DEMO_CIRCUIT.id,
        circuitName: DEMO_CIRCUIT.name,
        circuit: DEMO_CIRCUIT,
        frames: [{ time: 0, cars: world.cars }],
        telemetrySessionId: null,
        bestLapSeconds: null,
        totalTimeSeconds: 0,
        lapCount: 0,
        mgWh: 0,
        trackLength: DEMO_TRACK.length,
    };
}

test('valida una repetición con el circuito y las dos telemetrías', () => {
    const replay = validateReplayDocument(document());
    assert.equal(replay.eventName, 'Navarra 2026');
    assert.equal(replay.frames[0].cars.length, 2);
    assert.equal(replay.trackLength, DEMO_TRACK.length);
});

test('rechaza tiempos de muestra fuera de orden', () => {
    const value = document();
    value.frames = [
        ...value.frames,
        { time: 0, cars: value.frames[0].cars },
    ];
    assert.throws(() => validateReplayDocument(value), /muestra 2/);
});

test('rechaza metadatos de circuito o distancia incoherentes', () => {
    assert.throws(() => validateReplayDocument({ ...document(), circuitName: 'Otra pista' }), /no coincide/);
    assert.throws(() => validateReplayDocument({ ...document(), trackLength: DEMO_TRACK.length + 10 }), /estadísticas/);
});

test('rechaza lecturas imposibles en una muestra', () => {
    const value = document();
    value.frames[0].cars[1] = { ...value.frames[0].cars[1], speed: -1 };
    assert.throws(() => validateReplayDocument(value), /fuera de rango/);
});

test('rechaza una sesión vacía o con formato incorrecto', () => {
    assert.throws(() => validateReplayDocument({ ...document(), frames: [] }), /entre 1 y 20.000/);
    assert.throws(() => validateReplayDocument({ ...document(), eventDate: '17-11-2026' }), /fecha/);
});
