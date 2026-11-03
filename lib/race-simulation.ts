import type { CarId } from './telemetry';
import { lapSpeed } from './race-track';

export type RaceReading = {
    time: number;
    motorTemp: number;
    batteryTemp: number;
    speed: number;
    consumptionWh: number;
};

export const RACE_HISTORY_LIMIT = 600;

// Deterministic, synthetic telemetry. These values never represent hardware readings.
export function nextRaceReading(previous: RaceReading | undefined, carId: CarId): RaceReading {
    const time = previous ? previous.time + 1 : 0;
    const phase = carId === 'car-2' ? 1.4 : 0;
    const speed = lapSpeed(time) * (carId === 'car-2' ? 1.02 : 1);
    const powerW = 100 + speed * 5.2 + Math.max(0, speed - (previous?.speed ?? speed)) * 26;
    const motorTemp = 43 + 16 * (1 - Math.exp(-time / 100)) + 2.8 * Math.sin(time / 30 + phase);
    const batteryTemp = 24 + 10 * (1 - Math.exp(-time / 190)) + 1.2 * Math.sin(time / 50 + phase);
    return { time, speed, motorTemp, batteryTemp, consumptionWh: (previous?.consumptionWh ?? 0) + (previous ? powerW / 3600 : 0) };
}

export function initialRaceReadings(carId: CarId): RaceReading[] {
    const readings: RaceReading[] = [];
    for (let i = 0; i < 60; i++) readings.push(nextRaceReading(readings.at(-1), carId));
    return readings;
}

export function advanceRaceReadings(readings: RaceReading[], carId: CarId): RaceReading[] {
    return [...readings.slice(-(RACE_HISTORY_LIMIT - 1)), nextRaceReading(readings.at(-1), carId)];
}
