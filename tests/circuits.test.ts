import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitRuntime, DEMO_TRACK, geoToVertices, MAX_GRADE, validateCircuit, type CircuitDefinition, type CircuitPoint } from '../lib/circuits';

const square = (vertices: CircuitPoint[]): CircuitDefinition => ({ version: 1, id: 't', name: 'Prueba', competition: '', width: 6, source: 'map', vertices, updatedAt: 'test' });
const flatSquare = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }];

test('un circuito sin alturas sigue siendo llano', () => {
    const track = createCircuitRuntime(square(flatSquare));
    assert.equal(track.elevation.hasElevation, false);
    assert.equal(track.elevation.range, 0);
    for (const p of [0, .25, .5, .9]) { assert.equal(track.point(p).y, 0); assert.equal(track.point(p).grade, 0); }
    assert.ok(Math.abs(track.length - 400) < 1e-6);
});

test('las alturas se interpolan entre los puntos marcados y el punto más bajo queda a 0', () => {
    const track = createCircuitRuntime(square([{ x: 0, z: 0, y: 100 }, { x: 100, z: 0 }, { x: 100, z: 100, y: 110 }, { x: 0, z: 100 }]));
    assert.ok(Math.abs(track.elevation.range - 10) < .01);
    assert.ok(Math.abs(track.point(0).y) < .01, 'la meta es el punto más bajo');
    assert.ok(Math.abs(track.point(.5).y - 10) < .01, 'la cima está en el punto marcado');
    assert.ok(track.point(.25).y > 0 && track.point(.25).y < 10, 'el tramo intermedio sube gradualmente');
    assert.ok(track.point(.2).grade > 0, 'subiendo, la pendiente es positiva');
    assert.ok(track.point(.7).grade < 0, 'bajando, la pendiente es negativa');
});

test('la curva de alturas no se sale del rango de los puntos marcados', () => {
    const track = createCircuitRuntime(square([{ x: 0, z: 0, y: 0 }, { x: 100, z: 0, y: 8 }, { x: 100, z: 100, y: 9 }, { x: 0, z: 100, y: 2 }]));
    for (let i = 0; i <= 400; i++) { const y = track.point(i / 400).y; assert.ok(y >= -1e-6 && y <= 9 + 1e-6, `altura ${y} fuera de rango`); }
});

test('rechaza pendientes por encima del máximo', () => {
    assert.throws(() => createCircuitRuntime(square([{ x: 0, z: 0, y: 0 }, { x: 100, z: 0, y: 60 }, { x: 100, z: 100 }, { x: 0, z: 100 }])), /pendiente/);
    assert.ok(MAX_GRADE <= .25);
});

test('las alturas se conservan al guardar y validar un circuito de mapa', () => {
    const geographic = [{ lat: 43.27, lng: -2.93, alt: 50 }, { lat: 43.27, lng: -2.928 }, { lat: 43.2715, lng: -2.928, alt: 58 }, { lat: 43.2715, lng: -2.93 }];
    const circuit = validateCircuit({ ...square([]), source: 'map', vertices: geoToVertices(geographic), geographic });
    assert.equal(circuit.geographic?.[0].alt, 50);
    assert.equal(circuit.geographic?.[1].alt, undefined);
    assert.equal(circuit.vertices[2].y, 58);
    assert.ok(createCircuitRuntime(circuit).elevation.hasElevation);
});

test('rechaza alturas no numéricas', () => {
    assert.throws(() => validateCircuit({ ...square(flatSquare), vertices: [{ x: 0, z: 0, y: 'alto' }, ...flatSquare.slice(1)] }), /alturas/);
});

test('el circuito de demostración tiene una colina suave', () => {
    assert.ok(DEMO_TRACK.elevation.hasElevation);
    assert.ok(DEMO_TRACK.elevation.range > 10 && DEMO_TRACK.elevation.maxGrade < .12);
});
