import type { CarId } from './telemetry';
import { DEMO_TRACK, type CircuitRuntime } from './circuits';

export type RaceVehicle = {
    id: CarId; distance: number; speed: number; acceleration: number;
    lane: number; steering: number; throttle: number; brake: number;
    motorTemp: number; batteryTemp: number; consumptionWh: number;
    powerW: number; lapStarted: number; lastLap: number | null; bestLap: number | null;
};
export type RaceWorld = { elapsed: number; cars: [RaceVehicle, RaceVehicle] };
export const FIXED_STEP = 1 / 60;
const GRAVITY = 9.81;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));

export function createRaceWorld(track: CircuitRuntime = DEMO_TRACK): RaceWorld {
    const car = (id: CarId, distance: number, lane: number): RaceVehicle => ({
        id, distance, lane, speed: 0, acceleration: 0, steering: 0, throttle: 0, brake: 0,
        motorTemp: 35, batteryTemp: 26, consumptionWh: 0, powerW: 0,
        lapStarted: 0, lastLap: null, bestLap: null,
    });
    const lane = Math.min(.9, track.width * .19);
    return { elapsed: 0, cars: [car('car-1', 3.2, -lane), car('car-2', 0, lane)] };
}

// Simplified physics, not a validated model of an actual F24 car.
// Distance, animation, lap timing and Wh all come from this one simulation clock.
export function stepRace(world: RaceWorld, delta = FIXED_STEP, track: CircuitRuntime = DEMO_TRACK): RaceWorld {
    const dt = clamp(delta, 0, .05);
    if (!dt) return world;
    const elapsed = world.elapsed + dt;
    const cars = world.cars.map((car, index): RaceVehicle => {
        const progress = car.distance / track.length;
        const here = track.point(progress), ahead = track.point(progress + 9 / track.length);
        const curvature = Math.abs(angle(ahead.heading - here.heading)) / 9;
        const cornerSpeed = Math.sqrt(3.0 / Math.max(curvature, .001));
        const strategy = 1 + .075 * Math.sin(elapsed / 18 + index * Math.PI);
        const targetSpeed = clamp(Math.min(13.1, cornerSpeed) * strategy, 2.5, 14.1);
        const mass = index ? 112 : 108;
        const drag = 12 + .18 * car.speed * car.speed;
        // Gravity along the slope: positive uphill (slows the car), negative downhill (pushes it).
        const gravity = mass * GRAVITY * here.grade / Math.sqrt(1 + here.grade * here.grade);
        const availableForce = (index ? 565 : 550) * .82 / Math.max(1.2, car.speed);
        const wantedAcceleration = (targetSpeed - car.speed) * 1.35;
        // Downhill the controller brakes to hold its target speed; uphill the motor force limits the climb.
        const acceleration = clamp(wantedAcceleration, -2.6, Math.min(.95, (availableForce - drag - gravity) / mass));
        const speed = Math.max(0, car.speed + acceleration * dt);
        const distance = car.distance + (car.speed + speed) * .5 * dt;
        const tractive = mass * acceleration + drag + gravity;
        const powerW = Math.max(0, tractive * speed) / .82 + 12;
        const completed = Math.floor(distance / track.length) > Math.floor(car.distance / track.length);
        const lapTime = elapsed - car.lapStarted;
        const turn = angle(ahead.heading - here.heading);
        return {
            ...car, distance, speed, acceleration, powerW,
            lane: (index ? 1 : -1) * Math.min(.9, track.width * .19) - clamp(turn, -.5, .5) * .4,
            steering: clamp(turn * 5, -1, 1),
            throttle: clamp(tractive / Math.max(1, availableForce), 0, 1),
            brake: clamp(-tractive / (2.6 * mass), 0, 1),
            consumptionWh: car.consumptionWh + powerW * dt / 3600,
            motorTemp: car.motorTemp + (powerW * .20 - (car.motorTemp - 24) * 2) * dt / 800,
            batteryTemp: car.batteryTemp + (powerW * .045 - (car.batteryTemp - 24) * .9) * dt / 6000,
            lapStarted: completed ? elapsed : car.lapStarted,
            lastLap: completed ? lapTime : car.lastLap,
            bestLap: completed ? Math.min(car.bestLap ?? Infinity, lapTime) : car.bestLap,
        };
    }) as [RaceVehicle, RaceVehicle];
    return { elapsed, cars };
}

export function vehiclePose(car: RaceVehicle, track: CircuitRuntime = DEMO_TRACK) {
    const point = track.point(car.distance / track.length);
    return { x: point.x + Math.cos(point.heading) * car.lane, y: point.y, z: point.z - Math.sin(point.heading) * car.lane, heading: point.heading, grade: point.grade };
}

export function raceOrder(world: RaceWorld) {
    return [...world.cars].sort((a, b) => b.distance - a.distance);
}
