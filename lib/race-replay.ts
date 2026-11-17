import { createCircuitRuntime, validateCircuit, type CircuitDefinition } from './circuits';
import type { RaceVehicle } from './race-engine';

export type ReplayFrame = { time: number; cars: [RaceVehicle, RaceVehicle] };
export type ReplayDocument = {
    eventName: string;
    runName: string;
    eventDate: string;
    circuit: CircuitDefinition;
    frames: ReplayFrame[];
    telemetrySessionId: string | null;
    bestLapSeconds: number | null;
    totalTimeSeconds: number;
    lapCount: number;
    mgWh: number;
    trackLength: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function validateCar(value: unknown, index: number): RaceVehicle {
    if (!isRecord(value) || value.id !== (index === 0 ? 'car-1' : 'car-2')) {
        throw new Error(`El coche ${index + 1} de la repetición no es válido.`);
    }
    const getNumber = (field: string) => {
        const fieldValue = value[field];
        if (!finite(fieldValue)) throw new Error(`Faltan datos numéricos del coche ${index + 1}.`);
        return fieldValue;
    };
    const distance = getNumber('distance'), speed = getNumber('speed'), acceleration = getNumber('acceleration');
    const lane = getNumber('lane'), steering = getNumber('steering'), throttle = getNumber('throttle'), brake = getNumber('brake');
    const motorTemp = getNumber('motorTemp'), batteryTemp = getNumber('batteryTemp');
    const consumptionWh = getNumber('consumptionWh'), powerW = getNumber('powerW'), lapStarted = getNumber('lapStarted');
    if (distance < 0 || speed < 0 || speed > 250 || motorTemp < -40 || motorTemp > 300 ||
        batteryTemp < -40 || batteryTemp > 300 || consumptionWh < 0 || consumptionWh > 100_000 ||
        powerW < 0 || powerW > 200_000 || throttle < 0 || throttle > 1 || brake < 0 || brake > 1 ||
        steering < -1 || steering > 1) {
        throw new Error(`Los datos físicos del coche ${index + 1} están fuera de rango.`);
    }
    if ((value.lastLap !== null && !finite(value.lastLap)) || (value.bestLap !== null && !finite(value.bestLap)) ||
        (value.lastLapWh !== null && !finite(value.lastLapWh)) || !Array.isArray(value.lapHistory) ||
        value.lapHistory.length > 5 || !value.lapHistory.every(finite)) {
        throw new Error(`Los tiempos de vuelta del coche ${index + 1} no son válidos.`);
    }
    const lastLap = value.lastLap as number | null;
    const bestLap = value.bestLap as number | null;
    const lastLapWh = value.lastLapWh as number | null;
    if (lastLap !== null && lastLap < 0 || bestLap !== null && bestLap < 0 || lastLapWh !== null && lastLapWh < 0) {
        throw new Error(`Los valores de vuelta del coche ${index + 1} no pueden ser negativos.`);
    }
    if (value.routeProgress !== undefined && !finite(value.routeProgress) ||
        value.lapCount !== undefined && (!Number.isSafeInteger(value.lapCount) || (value.lapCount as number) < 0) ||
        value.offTrack !== undefined && typeof value.offTrack !== 'boolean' ||
        value.offTrackSeconds !== undefined && (!finite(value.offTrackSeconds) || value.offTrackSeconds < 0) ||
        value.worldX !== undefined && !finite(value.worldX) ||
        value.worldZ !== undefined && !finite(value.worldZ) ||
        value.worldHeading !== undefined && !finite(value.worldHeading)) {
        throw new Error(`El estado del coche ${index + 1} no es válido.`);
    }
    return {
        id: index === 0 ? 'car-1' : 'car-2',
        distance, speed, acceleration, lane, steering, throttle, brake, motorTemp, batteryTemp, consumptionWh, powerW, lapStarted,
        lastLap, bestLap, lastLapWh, lapHistory: value.lapHistory as number[],
        ...(value.worldX !== undefined ? { worldX: value.worldX as number } : {}),
        ...(value.worldZ !== undefined ? { worldZ: value.worldZ as number } : {}),
        ...(value.worldHeading !== undefined ? { worldHeading: value.worldHeading as number } : {}),
        ...(value.routeProgress !== undefined ? { routeProgress: value.routeProgress as number } : {}),
        ...(value.lapCount !== undefined ? { lapCount: value.lapCount as number } : {}),
        ...(value.offTrack !== undefined ? { offTrack: value.offTrack as boolean } : {}),
        ...(value.offTrackSeconds !== undefined ? { offTrackSeconds: value.offTrackSeconds as number } : {}),
    };
}

export function validateReplayDocument(value: unknown): ReplayDocument {
    if (!isRecord(value)) throw new Error('El documento de repetición no es válido.');
    if (typeof value.eventName !== 'string' || !value.eventName.trim() || value.eventName.trim().length > 160) {
        throw new Error('El campo eventName es obligatorio y no puede superar 160 caracteres.');
    }
    if (typeof value.runName !== 'string' || !value.runName.trim() || value.runName.trim().length > 160) {
        throw new Error('El campo runName es obligatorio y no puede superar 160 caracteres.');
    }
    for (const field of ['circuitId', 'circuitName'] as const) {
        if (typeof value[field] !== 'string' || !value[field].trim() || value[field].trim().length > 160) {
            throw new Error(`El campo ${field} es obligatorio y no puede superar 160 caracteres.`);
        }
    }
    if (typeof value.eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate)) {
        throw new Error('La fecha de la carrera no es válida.');
    }
    const date = new Date(`${value.eventDate}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.eventDate) {
        throw new Error('La fecha de la carrera no es válida.');
    }
    let circuit: CircuitDefinition;
    try {
        const demo = isRecord(value.circuit) && value.circuit.id === 'demo' && value.circuit.source === 'demo';
        let circuitInput = value.circuit;
        if (demo && isRecord(value.circuit)) circuitInput = { ...value.circuit, id: 'replay-demo', source: 'map' };
        const validated = validateCircuit(circuitInput);
        circuit = demo ? { ...validated, id: 'demo', source: 'demo' } : validated;
    }
    catch (error) { throw new Error(error instanceof Error ? `El circuito de la repetición no es válido: ${error.message}` : 'El circuito incluido en la repetición no es válido.'); }
    const runtime = createCircuitRuntime(circuit);
    if (circuit.id !== value.circuitId || circuit.name !== value.circuitName || runtime.length > 1_000_000) {
        throw new Error('El circuito de la repetición no coincide con sus metadatos.');
    }
    if (!Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 20_000) {
        throw new Error('La repetición debe contener entre 1 y 20.000 muestras.');
    }
    let previousTime = -1;
    const frames = value.frames.map((frame, frameIndex): ReplayFrame => {
        if (!isRecord(frame) || !finite(frame.time) || frame.time < 0 || frame.time <= previousTime ||
            !Array.isArray(frame.cars) || frame.cars.length !== 2) {
            throw new Error(`La muestra ${frameIndex + 1} de la repetición no es válida.`);
        }
        previousTime = frame.time;
        return { time: frame.time, cars: [validateCar(frame.cars[0], 0), validateCar(frame.cars[1], 1)] };
    });
    const telemetrySessionId = value.telemetrySessionId === null || value.telemetrySessionId === undefined ? null : value.telemetrySessionId;
    if (telemetrySessionId !== null && (typeof telemetrySessionId !== 'string' || telemetrySessionId.length > 100)) {
        throw new Error('La sesión de telemetría asociada no es válida.');
    }
    const bestLapSeconds = value.bestLapSeconds === null || value.bestLapSeconds === undefined ? null : value.bestLapSeconds;
    const totalTimeSeconds = value.totalTimeSeconds ?? frames.at(-1)!.time;
    const lapCount = value.lapCount ?? 0;
    const mgWh = value.mgWh;
    const trackLength = value.trackLength;
    if ((bestLapSeconds !== null && (!finite(bestLapSeconds) || bestLapSeconds <= 0)) ||
        !finite(totalTimeSeconds) || totalTimeSeconds < 0 || totalTimeSeconds > frames.at(-1)!.time + 1 ||
        !Number.isSafeInteger(lapCount) || (lapCount as number) < 0 || (lapCount as number) > 10_000 ||
        !finite(mgWh) || mgWh < 0 || mgWh > 100_000 ||
        !finite(trackLength) || trackLength <= 0 || trackLength > 1_000_000 ||
        Math.abs(trackLength - runtime.length) > 1) {
        throw new Error('Las estadísticas de la repetición no son válidas.');
    }
    if (bestLapSeconds !== null && bestLapSeconds > totalTimeSeconds) throw new Error('El mejor tiempo no puede superar la duración de la carrera.');
    return {
        eventName: value.eventName.trim(),
        runName: value.runName.trim(),
        eventDate: value.eventDate,
        circuit,
        frames,
        telemetrySessionId,
        bestLapSeconds,
        totalTimeSeconds,
        lapCount: lapCount as number,
        mgWh,
        trackLength,
    };
}
