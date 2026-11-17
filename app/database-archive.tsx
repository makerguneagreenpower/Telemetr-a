'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Folder, Play, Pause, RefreshCw } from 'lucide-react';
import { createCircuitRuntime, DEMO_CIRCUIT, type CircuitDefinition } from '../lib/circuits';
import type { RaceVehicle, RaceWorld } from '../lib/race-engine';
import { cars, type CarId, type SessionType } from '../lib/telemetry';
import { useCircuits } from './use-circuits';
import RaceWorldView from './race-world-view';

type ReplayItem = {
    id: string;
    eventName: string;
    runName: string;
    circuitId: string;
    circuitName: string;
    trackLength: number;
    eventDate: string;
    createdAt: string;
    bestLapSeconds: number | null;
    mgWh: number;
    totalTimeSeconds: number;
    lapCount: number;
    telemetrySessionId: string | null;
};
type SessionItem = {
    id: string;
    name: string;
    createdAt: string;
    carId: CarId | null;
    carCategory: string | null;
    sessionType: SessionType | null;
    eventDate: string | null;
    stats: { mean: number; maxSpeed: number; duration: number; distance: number; maxMotor: number | null; maxBattery: number | null };
};
type CircuitItem = { circuitId: string; name: string; competition: string; source: string; width: number; length: number; maxGrade: number; elevationRange: number; updatedAt: string };
type ReplayFrame = { time: number; cars: [RaceVehicle, RaceVehicle] };
type ReplayData = { id: string; eventName: string; runName: string; eventDate: string; circuit: CircuitDefinition; frames: ReplayFrame[]; telemetrySessionId: string | null };
type ArchiveTab = 'races' | 'cars' | 'circuits';
type CompareOption = { id: string; label: string; metrics: Array<[string, number | string | null]> };

const seconds = (value: number | null) => value === null ? '—' : `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toFixed(1).padStart(4, '0')}`;
const number = (value: number | null | undefined, digits = 1) => value == null ? '—' : value.toLocaleString('es-ES', { maximumFractionDigits: digits });

export default function DatabaseArchive({ user }: { user: boolean }) {
    const library = useCircuits();
    const [tab, setTab] = useState<ArchiveTab>('races');
    const [replays, setReplays] = useState<ReplayItem[]>([]);
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [savedCircuits, setSavedCircuits] = useState<CircuitItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedReplay, setSelectedReplay] = useState<ReplayData | null>(null);
    const [opening, setOpening] = useState(false);
    const [leftId, setLeftId] = useState('');
    const [rightId, setRightId] = useState('');
    const circuits = useMemo(() => [DEMO_CIRCUIT, ...library.circuits], [library.circuits]);

    async function fetchArchiveData() {
            const [replayResponse, sessionResponse, circuitResponse] = await Promise.all([fetch('/api/replays'), fetch('/api/sessions?metadata=1'), fetch('/api/circuits-db')]);
            const [replayResult, sessionResult, circuitResult] = await Promise.all([
                replayResponse.json() as Promise<{ items?: ReplayItem[]; error?: string }>,
                sessionResponse.json() as Promise<{ items?: SessionItem[]; error?: string }>,
                circuitResponse.json() as Promise<{ items?: CircuitItem[]; error?: string }>,
            ]);
            if (!replayResponse.ok) throw new Error(replayResult.error ?? 'No se pudieron cargar las carreras guardadas.');
            if (!sessionResponse.ok) throw new Error(sessionResult.error ?? 'No se pudieron cargar las sesiones de telemetría.');
            if (!circuitResponse.ok) throw new Error(circuitResult.error ?? 'No se pudieron cargar los circuitos del equipo.');
            return { replays: replayResult.items ?? [], sessions: sessionResult.items ?? [], circuits: circuitResult.items ?? [] };
    }

    useEffect(() => {
        if (!user) return;
        let active = true;
        fetchArchiveData().then(result => {
            if (!active) return;
            setReplays(result.replays); setSessions(result.sessions); setSavedCircuits(result.circuits);
        }).catch(cause => {
            if (active) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la base de datos.');
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [user]);

    async function refresh() {
        setLoading(true); setError('');
        try {
            const result = await fetchArchiveData();
            setReplays(result.replays); setSessions(result.sessions); setSavedCircuits(result.circuits);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo consultar la base de datos.');
        } finally {
            setLoading(false);
        }
    }

    const carOptions: CompareOption[] = cars.map(car => {
        const owned = sessions.filter(session => session.carId === car.id);
        const totalDuration = owned.reduce((sum, session) => sum + session.stats.duration, 0);
        const averageSpeed = totalDuration ? owned.reduce((sum, session) => sum + session.stats.mean * session.stats.duration, 0) / totalDuration : null;
        const maximum = (key: 'maxMotor' | 'maxBattery') => owned.map(session => session.stats[key]).filter((value): value is number => value !== null).reduce<number | null>((value, item) => value === null ? item : Math.max(value, item), null);
        return {
            id: car.id,
            label: `${car.name} · MGRT`,
            metrics: [
                ['Sesiones', owned.length],
                ['Distancia registrada', `${number(owned.reduce((sum, session) => sum + session.stats.distance, 0), 2)} km`],
                ['Velocidad media', averageSpeed === null ? null : `${number(averageSpeed)} km/h`],
                ['Velocidad máxima', owned.length ? `${number(Math.max(...owned.map(session => session.stats.maxSpeed)))} km/h` : null],
                ['Temperatura máxima motor', maximum('maxMotor') === null ? null : `${number(maximum('maxMotor'))} °C`],
                ['Temperatura máxima batería', maximum('maxBattery') === null ? null : `${number(maximum('maxBattery'))} °C`],
            ],
        };
    });
    const raceOptions: CompareOption[] = replays.map(replay => ({
        id: replay.id,
        label: `${replay.eventName} · ${replay.runName}`,
        metrics: [
            ['Circuito', replay.circuitName],
            ['Longitud', `${number(replay.trackLength, 0)} m`],
            ['Fecha', replay.eventDate],
            ['Vueltas', replay.lapCount],
            ['Duración', seconds(replay.totalTimeSeconds)],
            ['Mejor vuelta', seconds(replay.bestLapSeconds)],
            ['MGRT · energía de vuelta', `${number(replay.mgWh, 2)} Wh`],
            ['Telemetría asociada', replay.telemetrySessionId ? 'Sí' : 'No'],
        ],
    }));
    const localCircuitOptions: CompareOption[] = circuits.map(definition => {
        const track = createCircuitRuntime(definition);
        return {
            id: definition.id,
            label: definition.name,
            metrics: [
                ['Competición', definition.competition || '—'],
                ['Longitud', `${number(track.length, 0)} m`],
                ['Ancho', `${number(track.width)} m`],
                ['Desnivel', `${number(track.elevation.range)} m`],
                ['Subida acumulada', `${number(track.elevation.climb)} m`],
                ['Pendiente máxima', `${number(track.elevation.maxGrade * 100)} %`],
            ],
        };
    });
    const localIds = new Set(circuits.map(circuit => circuit.id));
    const circuitOptions: CompareOption[] = [
        ...localCircuitOptions,
        ...savedCircuits.filter(circuit => !localIds.has(circuit.circuitId)).map(circuit => ({
            id: circuit.circuitId,
            label: circuit.name,
            metrics: [
                ['Competición', circuit.competition || '—'],
                ['Longitud', `${number(circuit.length, 0)} m`],
                ['Ancho', `${number(circuit.width)} m`],
                ['Desnivel', `${number(circuit.elevationRange)} m`],
                ['Subida acumulada', 'Disponible al abrir circuito local'],
                ['Pendiente máxima', `${number(circuit.maxGrade * 100)} %`],
            ] as Array<[string, number | string | null]>,
        })),
    ];
    const options = tab === 'races' ? raceOptions : tab === 'cars' ? carOptions : circuitOptions;
    const left = options.find(option => option.id === leftId) ?? options[0];
    const right = options.find(option => option.id === rightId) ?? options[1] ?? options[0];
    const replayFolders = useMemo(() => replays.reduce<Record<string, ReplayItem[]>>((groups, replay) => {
        (groups[replay.eventName] ??= []).push(replay);
        return groups;
    }, {}), [replays]);

    async function openReplay(id: string) {
        setOpening(true); setError('');
        try {
            const response = await fetch(`/api/replays/${encodeURIComponent(id)}`);
            const result = await response.json() as ReplayData & { error?: string };
            if (!response.ok) throw new Error(result.error ?? 'No se pudo abrir la repetición.');
            if (!Array.isArray(result.frames) || !result.frames.length) throw new Error('La repetición no tiene muestras.');
            setSelectedReplay(result);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo abrir la repetición.');
        } finally {
            setOpening(false);
        }
    }

    if (!user) return <section className="panel database-login"><Database size={30} /><h2>Base de datos privada del equipo</h2><p>Inicia sesión para consultar sesiones, carreras, circuitos y comparativas de MGRT.</p><a className="primary" href="/acceso">Iniciar sesión</a></section>;

    return <div className="database-archive">
        <div className="database-toolbar"><div><strong>Archivo del equipo</strong><span>Las repeticiones, la telemetría y los circuitos sincronizados pertenecen a tu cuenta; los circuitos previos siguen también en este navegador.</span></div><button className="secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} />Actualizar</button></div>
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="database-tabs" role="tablist" aria-label="Tipo de datos">
            <button role="tab" aria-selected={tab === 'races'} onClick={() => { setTab('races'); setLeftId(''); setRightId(''); }}>Carreras y repeticiones</button>
            <button role="tab" aria-selected={tab === 'cars'} onClick={() => { setTab('cars'); setLeftId(''); setRightId(''); }}>Coches y telemetría</button>
            <button role="tab" aria-selected={tab === 'circuits'} onClick={() => { setTab('circuits'); setLeftId(''); setRightId(''); }}>Circuitos</button>
        </div>
        {tab === 'races' && <section className="panel database-folders">
            <div className="panel-heading"><div><h2>Repeticiones de carrera</h2><p>Organizadas como evento › sesión</p></div><span>{replays.length} guardadas</span></div>
            {!replays.length && !loading && <p className="database-empty">Aún no hay repeticiones. Termina una carrera y guárdala para archivarla aquí.</p>}
            {Object.entries(replayFolders).map(([event, entries]) => <details className="database-folder" key={event} open>
                <summary><Folder size={17} />{event}<span>{entries.length} sesiones</span></summary>
                {entries.map(replay => <div className="database-file" key={replay.id}>
                    <div><strong>{replay.runName}</strong><small>{replay.eventDate} · {replay.circuitName} · {replay.lapCount} vueltas · mejor {seconds(replay.bestLapSeconds)}</small></div>
                    <button className="secondary" disabled={opening} onClick={() => void openReplay(replay.id)}>{opening ? 'Abriendo…' : 'Ver repetición'}</button>
                </div>)}
            </details>)}
        </section>}
        {tab === 'cars' && <section className="panel database-folders">
            <div className="panel-heading"><div><h2>Telemetría por coche</h2><p>Datos reales importados desde la sección Telemetría</p></div><span>{sessions.length} sesiones</span></div>
            <div className="database-car-list">{carOptions.map(option => <article key={option.id}><h3>{option.label}</h3>{option.metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</article>)}</div>
            {!sessions.length && <p className="database-empty">Sube datos desde «Telemetría» para habilitar las comparativas de coches.</p>}
        </section>}
        {tab === 'circuits' && <section className="panel database-folders">
            <div className="panel-heading"><div><h2>Circuitos</h2><p>Datos de geometría y elevación de las pistas locales y sincronizadas con el equipo</p></div><span>{circuitOptions.length} circuitos</span></div>
            <div className="database-circuit-list">{circuitOptions.map(option => <article key={option.id}><h3>{option.label}</h3>{option.metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</article>)}</div>
            {library.error && <p className="notice" role="alert">{library.error}</p>}
        </section>}
        {options.length > 1 && <section className="panel database-comparison">
            <div className="panel-heading"><div><h2>Comparar {tab === 'races' ? 'carreras' : tab === 'cars' ? 'coches' : 'circuitos'}</h2><p>La comparación solo permite elementos del mismo tipo.</p></div></div>
            <div className="database-compare-selects"><label>Elemento A<select value={left?.id ?? ''} onChange={event => setLeftId(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Elemento B<select value={right?.id ?? ''} onChange={event => setRightId(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div>
            {left && right && <div className="database-compare-table"><div className="database-compare-head"><span>Estadística</span><strong>{left.label}</strong><strong>{right.label}</strong></div>{left.metrics.map(([label, value], index) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong><strong>{right.metrics[index]?.[1] ?? '—'}</strong></div>)}</div>}
        </section>}
        {selectedReplay && <ReplayPlayer replay={selectedReplay} onClose={() => setSelectedReplay(null)} />}
    </div>;
}

function ReplayPlayer({ replay, onClose }: { replay: ReplayData; onClose: () => void }) {
    const track = useMemo(() => createCircuitRuntime(replay.circuit), [replay.circuit]);
    const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false);
    const worldRef = useRef<RaceWorld>({ elapsed: replay.frames[0].time, cars: replay.frames[0].cars });
    const frame = replay.frames[index];
    const world = useMemo<RaceWorld>(() => ({ elapsed: frame.time, cars: frame.cars }), [frame]);
    const playbackIndex = useRef(index);
    useEffect(() => { worldRef.current = world; }, [world]);
    useEffect(() => { playbackIndex.current = index; }, [index]);
    useEffect(() => {
        if (!playing) return;
        const interval = window.setInterval(() => {
            const next = Math.min(playbackIndex.current + 1, replay.frames.length - 1);
            playbackIndex.current = next;
            setIndex(next);
            if (next === replay.frames.length - 1) setPlaying(false);
        }, 200);
        return () => window.clearInterval(interval);
    }, [playing, replay.frames.length]);

    return <section className="panel replay-player" aria-label={`Repetición de ${replay.eventName}, ${replay.runName}`}>
        <div className="panel-heading"><div><h2>{replay.eventName} › {replay.runName}</h2><p>{replay.eventDate} · {replay.circuit.name} · {replay.frames.length} muestras de carrera</p></div><button className="secondary" onClick={onClose}>Cerrar</button></div>
        <RaceWorldView worldRef={worldRef} world={world} running={false} track={track} />
        <div className="replay-controls"><button className="secondary" onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pausar' : 'Reproducir'}</button><input aria-label="Posición en la repetición" type="range" min="0" max={replay.frames.length - 1} value={index} onChange={event => { const next = Number(event.target.value); playbackIndex.current = next; setIndex(next); setPlaying(false); }} /><span>{seconds(frame.time)}</span></div>
        <div className="replay-snapshot">{frame.cars.map((car, carIndex) => <div key={car.id}><strong>{carIndex === 0 ? 'MGRT · MG01' : 'Rival simulado'}</strong><span>{(car.speed * 3.6).toFixed(1)} km/h</span><span>{car.motorTemp.toFixed(1)} °C motor</span><span>{car.batteryTemp.toFixed(1)} °C batería</span><span>{car.consumptionWh.toFixed(2)} Wh / vuelta</span></div>)}</div>
    </section>;
}
