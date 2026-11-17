import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitRuntime, type CircuitPoint } from '../lib/circuits';
import { createRaceWorld, keyboardDrivingInput, stepPlayerCar, stepRace, vehiclePose, FIXED_STEP, OFF_TRACK_RESET_SECONDS, type RaceVehicle, type RaceWorld } from '../lib/race-engine';

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

test('el piloto controla aceleración, frenada y posición dentro de la pista', () => {
    const initial = createRaceWorld(flat).cars[0];
    const accelerated = stepPlayerCar(initial, { throttle: 1, brake: 0, steering: 0 }, 1, flat, 1);
    assert.ok(accelerated.speed > initial.speed);
    assert.ok(accelerated.distance > initial.distance);
    let steered = accelerated;
    for (let index = 0; index < 60; index++) {
        steered = stepPlayerCar(steered, { throttle: 1, brake: 0, steering: 1 }, FIXED_STEP, flat, 2 + index * FIXED_STEP);
    }
    assert.notEqual(steered.worldHeading, accelerated.worldHeading);
    assert.notEqual(steered.worldX, vehiclePose(accelerated, flat).x);
    assert.notEqual(steered.worldZ, vehiclePose(accelerated, flat).z);
    const braked = stepPlayerCar(accelerated, { throttle: 0, brake: 1, steering: 0 }, 1, flat, 2);
    assert.ok(braked.speed < accelerated.speed);
});

test('las flechas de dirección corresponden al lado indicado', () => {
    assert.equal(keyboardDrivingInput(new Set(['arrowleft'])).steering, 1);
    assert.equal(keyboardDrivingInput(new Set(['arrowright'])).steering, -1);
    assert.equal(keyboardDrivingInput(new Set(['arrowup'])).throttle, 1);
    assert.equal(keyboardDrivingInput(new Set(['arrowdown'])).brake, 1);
    assert.equal(keyboardDrivingInput(new Set([' '])).brake, 1);
});

test('el coche activa la cuenta atrás al salir y la cancela al volver a pista', () => {
    let car = { ...createRaceWorld(flat).cars[0], speed: 10 };
    for (let index = 0; index < 600 && !car.offTrack; index++) {
        car = stepPlayerCar(car, { throttle: 1, brake: 0, steering: 1 }, FIXED_STEP, flat, index * FIXED_STEP);
    }
    assert.ok(car.worldX !== undefined && car.worldZ !== undefined);
    assert.ok(Math.hypot(car.worldX - vehiclePose(car, flat).x, car.worldZ - vehiclePose(car, flat).z) < .001);
    assert.ok(car.speed <= 6);
    assert.equal(car.offTrack, true);
    assert.ok((car.offTrackSeconds ?? 0) > 0);

    const trackPoint = flat.point(.5);
    const approachingTrack: RaceVehicle = {
        ...car,
        speed: 6,
        worldX: trackPoint.x,
        worldZ: trackPoint.z,
        worldHeading: trackPoint.heading,
        offTrack: true,
        offTrackSeconds: 1,
    };
    const returnedToTrack = stepPlayerCar(approachingTrack, { throttle: 1, brake: 0, steering: 0 }, FIXED_STEP, flat, 11);
    assert.equal(returnedToTrack.offTrack, false);
    assert.equal(returnedToTrack.offTrackSeconds, 0);
});

test('la cuenta atrás de salida de pista alcanza los cinco segundos', () => {
    let car: RaceVehicle = { ...createRaceWorld(flat).cars[0], speed: 10, worldX: 120, worldZ: 120, worldHeading: Math.PI / 4 };
    for (let index = 0; index < 600 && (car.offTrackSeconds ?? 0) < OFF_TRACK_RESET_SECONDS; index++) {
        car = stepPlayerCar(car, { throttle: 1, brake: 0, steering: 0 }, FIXED_STEP, flat, index * FIXED_STEP);
    }
    assert.equal(car.offTrack, true);
    assert.ok((car.offTrackSeconds ?? 0) >= OFF_TRACK_RESET_SECONDS);
});

test('mantener el freno detiene el coche', () => {
    let car = { ...createRaceWorld(flat).cars[0], speed: 12 };
    for (let index = 0; index < 120; index++) {
        car = stepPlayerCar(car, { throttle: 0, brake: 1, steering: 0 }, FIXED_STEP, flat, index * FIXED_STEP);
    }
    assert.equal(car.speed, 0);
});

test('el piloto registra vueltas y reinicia los Wh por vuelta', () => {
    const car = { ...createRaceWorld(flat).cars[0], distance: flat.length - 1, speed: 8, lapStarted: 2, consumptionWh: 1 };
    let next = car;
    for (let index = 1; index <= 10; index++) {
        next = stepPlayerCar(next, { throttle: 1, brake: 0, steering: 0 }, FIXED_STEP, flat, 10 + index * FIXED_STEP);
    }
    assert.notEqual(next.lastLap, null);
    assert.equal(next.bestLap, next.lastLap);
    assert.ok(next.lastLapWh !== null && next.lastLapWh > car.consumptionWh);
    assert.ok(next.consumptionWh < next.lastLapWh);
    assert.equal(next.lapHistory[0], next.lastLap);
});
