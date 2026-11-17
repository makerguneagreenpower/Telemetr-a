'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Pause, Play, Radio, RotateCcw, Thermometer, TriangleAlert, Zap } from 'lucide-react';
import { createRaceWorld, FIXED_STEP, raceOrder, stepRace, type RaceVehicle, type RaceWorld } from '../lib/race-engine';
import { createCircuitRuntime, DEMO_CIRCUIT, type CircuitDefinition, type CircuitRuntime } from '../lib/circuits';
import type { Sample, Session } from '../lib/telemetry';
import { setActiveCircuit } from '../lib/circuit-storage';
import { useCircuits } from './use-circuits';
import RaceWorldView from './race-world-view';
import RaceCockpit from './race-cockpit';

const format = (value: number, decimals = 1) => value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
function sampleAtTime(samples: Sample[], time: number) {
    let low = 0, high = samples.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (samples[middle].time <= time) low = middle + 1;
        else high = middle;
    }
    return low === 0 ? null : samples[low - 1] ?? null;
}

export default function RaceLive({ onManageCircuits, user }: { onManageCircuits: () => void; user: boolean }) {
    const library = useCircuits();
    const [error, setError] = useState('');
    const definition = library.circuits.find(circuit => circuit.id === library.activeId) ?? DEMO_CIRCUIT;
    const track = useMemo(() => createCircuitRuntime(definition), [definition]);
    return <div className="race-live"><div className="panel circuit-race-picker"><label htmlFor="race-circuit">Circuito de la carrera<select id="race-circuit" value={track.id} disabled={library.loading} onChange={event => { try { setActiveCircuit(event.target.value); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo seleccionar el circuito.'); } }}><option value="demo">Circuito de demostración</option>{library.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}{circuit.competition ? ` · ${circuit.competition}` : ''}</option>)}</select></label><div><strong>{Math.round(track.length).toLocaleString('es-ES')} m</strong><small>{track.width} m de ancho · {track.source === 'demo' ? 'Demostración' : 'Trazado guardado'}</small></div><button type="button" className="secondary" onClick={onManageCircuits}>Añadir / editar circuitos</button><p className="circuit-race-hint">Cambiar de circuito reinicia la simulación de los dos coches.</p></div>{(error || library.error) && <p className="notice" role="status">{error || library.error}</p>}{library.loading ? <p role="status">Cargando circuitos guardados…</p> : <RaceSimulation key={`${track.id}:${track.revision}`} track={track} circuit={definition} user={user}/>}</div>;
}

type RaceFrame = { time: number; cars: RaceVehicle[] };
type TelemetryOption = Pick<Session, 'id' | 'name' | 'carId' | 'eventDate' | 'sessionType' | 'carCategory'>;
const dateToday = () => new Date().toISOString().slice(0, 10);

function snapshot(world: RaceWorld): RaceFrame {
    return { time: world.elapsed, cars: world.cars.map(car => ({ ...car, lapHistory: [...car.lapHistory] })) };
}

function RaceSimulation({ track, circuit, user }: { track: CircuitRuntime; circuit: CircuitDefinition; user: boolean }) {
    const [world, setWorld] = useState(() => createRaceWorld(track));
    const worldRef = useRef(world);
    const [running, setRunning] = useState(true);
    const [eventName, setEventName] = useState('Entrenamiento');
    const [runName, setRunName] = useState('Práctica 1');
    const [eventDate, setEventDate] = useState(dateToday);
    const [telemetrySessions, setTelemetrySessions] = useState<TelemetryOption[]>([]);
    const [telemetrySessionId, setTelemetrySessionId] = useState('');
    const [telemetrySamples, setTelemetrySamples] = useState<Sample[]>([]);
    const [saveBusy, setSaveBusy] = useState(false);
    const [finished, setFinished] = useState(false);
    const [replaySaved, setReplaySaved] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const frameHistory = useRef<RaceFrame[]>([snapshot(world)]);

    useEffect(() => {
        if (!running) return;
        let animation = 0, previous = performance.now(), published = previous, accumulator = 0, lastSample = 0;
        const update = (now: number) => {
            // Do not fast-forward the race when returning from a background tab.
            accumulator += Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
            while (accumulator >= FIXED_STEP) {
                worldRef.current = stepRace(worldRef.current, FIXED_STEP, track);
                accumulator -= FIXED_STEP;
                if (worldRef.current.elapsed - lastSample >= 1) {
                    frameHistory.current.push(snapshot(worldRef.current));
                    lastSample = worldRef.current.elapsed;
                }
            }
            if (now - published >= 100) { setWorld(worldRef.current); published = now; }
            animation = requestAnimationFrame(update);
        };
        animation = requestAnimationFrame(update);
        return () => cancelAnimationFrame(animation);
    }, [running, track]);

    function toggle() { setWorld(worldRef.current); setRunning(value => !value); }
    function reset() {
        const initial = createRaceWorld(track);
        worldRef.current = initial; frameHistory.current = [snapshot(initial)]; setWorld(initial);
        setFinished(false); setReplaySaved(false); setSaveMessage(''); setRunning(true);
    }
    async function finishRace() {
        setRunning(false); setFinished(true); setSaveMessage('');
        if (!user) { setSaveMessage('Inicia sesión para guardar la repetición en la base de datos.'); return; }
        setSaveBusy(true);
        const finalWorld = worldRef.current;
        const frames = [...frameHistory.current];
        if (frames.at(-1)?.time !== finalWorld.elapsed) frames.push(snapshot(finalWorld));
        const bestLap = finalWorld.cars.flatMap(car => car.bestLap === null ? [] : [car.bestLap]);
        try {
            const response = await fetch('/api/replays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventName, runName, eventDate, circuitId: circuit.id, circuitName: circuit.name, circuit,
                    trackLength: track.length,
                    frames, telemetrySessionId: telemetrySessionId || null,
                    bestLapSeconds: bestLap.length ? Math.min(...bestLap) : null,
                    mgWh: finalWorld.cars[0].consumptionWh,
                    totalTimeSeconds: finalWorld.elapsed,
                    lapCount: Math.max(...finalWorld.cars.map(car => Math.floor(car.distance / track.length))),
                }),
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar la repetición.');
            setReplaySaved(true);
            setSaveMessage('Carrera terminada y repetición guardada en la base de datos.');
        } catch (cause) {
            setSaveMessage(cause instanceof Error ? cause.message : 'No se pudo guardar la repetición.');
        } finally {
            setSaveBusy(false);
        }
    }

    useEffect(() => {
        if (!user) return;
        const controller = new AbortController();
        fetch('/api/sessions?metadata=1', { signal: controller.signal }).then(async response => {
            const result = await response.json() as { items?: TelemetryOption[]; error?: string };
            if (!response.ok) throw new Error(result.error ?? 'No se pudo cargar la telemetría guardada.');
            setTelemetrySessions(result.items ?? []);
        }).catch(cause => {
            if (!controller.signal.aborted) setSaveMessage(cause instanceof Error ? cause.message : 'No se pudo cargar la telemetría guardada.');
        });
        return () => controller.abort();
    }, [user]);
    useEffect(() => {
        if (!telemetrySessionId) return;
        const controller = new AbortController();
        fetch(`/api/sessions/${encodeURIComponent(telemetrySessionId)}`, { signal: controller.signal }).then(async response => {
            const result = await response.json() as { samples?: Sample[]; error?: string };
            if (!response.ok) throw new Error(result.error ?? 'No se pudo cargar la telemetría seleccionada.');
            setTelemetrySamples(result.samples ?? []);
        }).catch(cause => {
            if (!controller.signal.aborted) setSaveMessage(cause instanceof Error ? cause.message : 'No se pudo cargar la telemetría seleccionada.');
        });
        return () => controller.abort();
    }, [telemetrySessionId]);
    const order = raceOrder(world);
    const telemetryLabel = (session: TelemetryOption) => `${session.name} · ${session.carId === 'car-1' ? 'MG01' : session.carId === 'car-2' ? 'MG02' : 'Coche'} · ${session.eventDate ?? 'sin fecha'}`;
    const telemetrySample = sampleAtTime(telemetrySamples, world.elapsed);

    return <section className="race-live" aria-label="Carrera compartida de los dos coches">
        <div className="panel race-record-setup">
            <label>Evento<input value={eventName} maxLength={120} onChange={event => setEventName(event.target.value)} /></label>
            <label>Sesión<input value={runName} maxLength={120} onChange={event => setRunName(event.target.value)} /></label>
            <label>Fecha<input type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} /></label>
            <label className="race-telemetry-source">Datos MGRT desde Telemetría<select value={telemetrySessionId} onChange={event => setTelemetrySessionId(event.target.value)} disabled={!user || telemetrySessions.length === 0}><option value="">Sin sesión asociada</option>{telemetrySessions.map(session => <option key={session.id} value={session.id}>{telemetryLabel(session)}</option>)}</select></label>
        </div>
        <div className="race-controls panel"><div className="race-status" role="status"><Radio size={20} /><div><strong>{running ? 'Carrera en directo · rival simulado' : finished ? 'Carrera terminada' : 'Carrera pausada'}</strong><p>MGRT · datos de telemetría seleccionables · rival con telemetría simulada realista</p></div></div><div className="race-control-actions"><button type="button" className="secondary" onClick={toggle} disabled={finished}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pausar carrera' : 'Continuar carrera'}</button><button type="button" className="secondary" onClick={reset}><RotateCcw size={17} />Reiniciar los dos coches</button><button type="button" className="primary" onClick={finishRace} disabled={replaySaved || saveBusy}>{saveBusy ? 'Guardando…' : replaySaved ? 'Repetición guardada' : 'Carrera terminada'}</button></div></div>
        {saveMessage && <p className="notice" role={saveBusy ? 'status' : 'alert'}>{saveMessage}</p>}
        <RaceWorldView key={track.id} worldRef={worldRef} world={world} running={running} track={track} mgTelemetry={telemetrySample} />
        <div className="race-fleet-grid">{world.cars.map(car => <RaceCarLive key={car.id} car={car} position={order.findIndex(item => item.id === car.id) + 1} elapsed={world.elapsed} track={track} />)}</div>
    </section>;
}

function RaceCarLive({ car, position, elapsed, track }: { car: RaceVehicle; position: number; elapsed: number; track: CircuitRuntime }) {
    const carName = car.id === 'car-1' ? 'Coche 1' : 'Coche 2';
    return <section className="race-live race-car-screen" aria-labelledby={`live-${car.id}`}>
        <div className="race-car-heading"><span className={`race-car-swatch ${car.id}`} aria-hidden="true" /><div><h2 id={`live-${car.id}`}>{carName}</h2><p>{car.id === 'car-1' ? 'Blanco' : 'Negro y rojo'} · posición {position} · vuelta {Math.floor(car.distance / track.length) + 1}</p></div><span className="race-map-status">SIMULACIÓN</span></div>
        <div className="metrics-grid race-metrics">
            <LiveMetric label="TEMPERATURA DEL MOTOR" value={format(car.motorTemp)} unit="°C" limit={50} reading={car.motorTemp} icon={<Thermometer size={18} />} />
            <LiveMetric label="TEMPERATURA DE BATERÍAS" value={format(car.batteryTemp)} unit="°C" limit={40} reading={car.batteryTemp} icon={<Thermometer size={18} />} />
            <LiveMetric label="VELOCIDAD" value={format(car.speed * 3.6)} unit="km/h" limit={40} reading={car.speed * 3.6} icon={<Gauge size={18} />} />
            <LiveMetric label="ENERGÍA · VUELTA ACTUAL" value={format(car.consumptionWh, 2)} unit="Wh" limit={7} reading={car.consumptionWh} icon={<Zap size={18} />} />
        </div>
        <div className="race-lap-history"><strong>Últimas vueltas</strong>{car.lapHistory.length ? car.lapHistory.map((lap, index) => <span key={`${car.id}-${index}`}>V{car.lapHistory.length - index}: {format(lap, 1)} s</span>) : <span>Aún no hay vueltas completadas</span>}{car.lastLapWh !== null && <span>Última vuelta: {format(car.lastLapWh, 2)} Wh</span>}</div>
        <RaceCockpit car={car} elapsed={elapsed} track={track} />
    </section>;
}

function LiveMetric({ label, value, unit, icon, reading, limit }: { label: string; value: string; unit: string; icon: React.ReactNode; reading: number; limit: number }) {
    const exceeded = reading > limit;
    return <article className={`metric race-reading${exceeded ? ' race-reading-over-limit' : ''}`}>
        <div className="metric-label">{label}{icon}</div>
        <div className="race-alert-status" role="status" aria-live="polite" aria-atomic="true">{exceeded && <span className="race-alert-badge"><span className="race-alert-light" aria-hidden="true" /><TriangleAlert size={14} aria-hidden="true" />Alerta</span>}</div>
        <div className="metric-value">{value}<span>{unit}</span></div>
        <p className="metric-note">{exceeded ? 'Límite superado' : 'Dentro del límite'} · {limit} {unit}</p>
        <p className="race-reading-source">Lectura simulada</p>
    </article>;
}
