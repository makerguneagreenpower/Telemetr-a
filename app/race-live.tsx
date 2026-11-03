'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Pause, Play, Radio, RotateCcw, Thermometer, TriangleAlert, Zap } from 'lucide-react';
import { createRaceWorld, FIXED_STEP, raceOrder, stepRace, type RaceVehicle } from '../lib/race-engine';
import { createCircuitRuntime, DEMO_TRACK, type CircuitRuntime } from '../lib/circuits';
import { setActiveCircuit } from '../lib/circuit-storage';
import { useCircuits } from './use-circuits';
import RaceWorldView from './race-world-view';
import RaceCockpit from './race-cockpit';

const format = (value: number, decimals = 1) => value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function RaceLive({ onManageCircuits }: { onManageCircuits: () => void }) {
    const library = useCircuits();
    const [error, setError] = useState('');
    const definition = library.circuits.find(circuit => circuit.id === library.activeId);
    const track = useMemo(() => definition ? createCircuitRuntime(definition) : DEMO_TRACK, [definition]);
    return <div className="race-live"><div className="panel circuit-race-picker"><label htmlFor="race-circuit">Circuito de la carrera<select id="race-circuit" value={track.id} disabled={library.loading} onChange={event => { try { setActiveCircuit(event.target.value); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo seleccionar el circuito.'); } }}><option value="demo">Circuito de demostración</option>{library.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}{circuit.competition ? ` · ${circuit.competition}` : ''}</option>)}</select></label><div><strong>{Math.round(track.length).toLocaleString('es-ES')} m</strong><small>{track.width} m de ancho · {track.source === 'demo' ? 'Demostración' : 'Trazado guardado'}</small></div><button type="button" className="secondary" onClick={onManageCircuits}>Añadir / editar circuitos</button><p className="circuit-race-hint">Cambiar de circuito reinicia la simulación de los dos coches.</p></div>{(error || library.error) && <p className="notice" role="status">{error || library.error}</p>}{library.loading ? <p role="status">Cargando circuitos guardados…</p> : <RaceSimulation key={`${track.id}:${track.revision}`} track={track}/>}</div>;
}

function RaceSimulation({ track }: { track: CircuitRuntime }) {
    const [world, setWorld] = useState(() => createRaceWorld(track));
    const worldRef = useRef(world);
    const [running, setRunning] = useState(true);

    useEffect(() => {
        if (!running) return;
        let animation = 0, previous = performance.now(), published = previous, accumulator = 0;
        const update = (now: number) => {
            // Do not fast-forward the race when returning from a background tab.
            accumulator += Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
            while (accumulator >= FIXED_STEP) { worldRef.current = stepRace(worldRef.current, FIXED_STEP, track); accumulator -= FIXED_STEP; }
            if (now - published >= 100) { setWorld(worldRef.current); published = now; }
            animation = requestAnimationFrame(update);
        };
        animation = requestAnimationFrame(update);
        return () => cancelAnimationFrame(animation);
    }, [running, track]);

    function toggle() { setWorld(worldRef.current); setRunning(value => !value); }
    function reset() { const initial = createRaceWorld(track); worldRef.current = initial; setWorld(initial); }
    const order = raceOrder(world);

    return <section className="race-live" aria-label="Carrera compartida de los dos coches">
        <div className="race-controls panel"><div className="race-status" role="status"><Radio size={20} /><div><strong>{running ? 'Dos coches en pista' : 'Carrera pausada'}</strong><p>Simulación compartida · Coche 1 blanco y Coche 2 negro y rojo</p></div></div><div className="race-control-actions"><button type="button" className="secondary" onClick={toggle}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pausar carrera' : 'Continuar carrera'}</button><button type="button" className="secondary" onClick={reset}><RotateCcw size={17} />Reiniciar los dos coches</button></div></div>
        <RaceWorldView key={track.id} worldRef={worldRef} world={world} running={running} track={track} />
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
            <LiveMetric label="CONSUMO ACUMULADO" value={format(car.consumptionWh, 2)} unit="Wh" limit={7} reading={car.consumptionWh} icon={<Zap size={18} />} />
        </div>
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
