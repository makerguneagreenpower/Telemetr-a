import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitRuntime, type CircuitPoint } from '../lib/circuits';
import { createRaceWorld, stepRace, FIXED_STEP, type RaceWorld } from '../lib/race-engine';

const track = (vertices: CircuitPoint[]) => createCircuitRuntime({ version: 1, id: 't', name: 't', competition: '', width: 6, source: 'map', vertices, updatedAt: 't' });
const flat = track([{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 200 }, { x: 0, z: 200 }]);
const hill = (top: number) => track([{ x: 0, z: 0, y: 0 }, { x: 200, z: 0 }, { x: 200, z: 200, y: top }, { x: 0, z: 200 }]);

function race(circuit: ReturnType<typeof track>, seconds: number, each?: (world: RaceWorld) => void) {
    let world = createRaceWorld(circuit);
    for (let t = 0; t < seconds; t += FIXED_STEP) { world = stepRace(world, FIXED_STEP, circuit); each?.(world); }
    return world;
}
const firstLap = (circuit: ReturnType<typeof track>) => { const world = race(circuit, 600); assert.notEqual(world.cars[0].lastLap, null, 'debe completar una vuelta'); return world; };

test('en llano los dos coches completan vueltas', () => {
    const world = firstLap(flat);
    assert.ok(world.cars[1].lastLap !== null);
});

test('una cuesta del 13 % se sube sin que el coche se quede parado', () => {
    const steep = hill(35);
    assert.ok(steep.elevation.maxGrade > .12);
    const world = firstLap(steep);
    assert.ok(world.cars[0].speed > 0);
});

test('con desnivel la vuelta es más lenta y gasta más que en llano', () => {
    const lapFlat = race(flat, 400), lapHill = race(hill(20), 400);
    assert.ok(lapHill.cars[0].lastLap! > lapFlat.cars[0].lastLap!);
    assert.ok(lapHill.cars[0].lastLapWh! / flat.length > lapFlat.cars[0].lastLapWh! / flat.length);
});

test('sin frenada regenerativa: Wh por vuelta no se acumula entre vueltas', () => {
    let minimum = Infinity, sawReset = false, previous = 0;
    race(hill(30), 300, world => {
        for (const car of world.cars) { minimum = Math.min(minimum, car.powerW); }
        const used = world.cars[0].consumptionWh;
        assert.ok(used >= 0, 'la energía de la vuelta debe ser positiva');
        if (used < previous) sawReset = true;
        previous = used;
    });
    assert.ok(sawReset, 'los Wh de la vuelta actual se reinician al cruzar meta');
    assert.ok(minimum >= 0, `potencia mínima ${minimum} W`);
});

test('en la bajada el motor no empuja: acelerador a cero cuando la cuesta basta', () => {
    const downhill = hill(30);
    let coasting = 0;
    race(downhill, 300, world => { const car = world.cars[0], grade = downhill.point(car.distance / downhill.length).grade; if (grade < -.08 && car.throttle === 0) coasting++; });
    assert.ok(coasting > 0, 'debe haber tramos de bajada sin acelerador');
});
