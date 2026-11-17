'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Expand, Flag, Video } from 'lucide-react';
import { raceOrder, vehiclePose, type RaceWorld } from '../lib/race-engine';
import type { CircuitRuntime } from '../lib/circuits';
import type { RaceCamera } from '../lib/race-3d';
import type { Sample } from '../lib/telemetry';

const cameraModes: { id: RaceCamera; label: string }[] = [{ id: 'duel', label: 'Los dos coches' }, { id: 'car-1', label: 'A bordo · MGRT 01' }, { id: 'car-2', label: 'A bordo · rival' }, { id: 'aerial', label: 'Vista aérea' }];
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function RaceWorldView({ worldRef, world, running, track, mgTelemetry }: { worldRef: RefObject<RaceWorld>; world: RaceWorld; running: boolean; track: CircuitRuntime; mgTelemetry?: Sample | null }) {
    const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<RaceCamera>('duel');
    const modeRef = useRef(mode);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [retry, setRetry] = useState(0), [fullscreenError, setFullscreenError] = useState('');
    const order = raceOrder(world);
    const focus = mode === 'car-2' ? world.cars[1] : mode === 'car-1' ? world.cars[0] : order[0];
    useEffect(() => { modeRef.current = mode; }, [mode]);

    useEffect(() => {
        let active = true, animation = 0;
        let scene: ReturnType<typeof import('../lib/race-3d').createRaceScene> | undefined;
        const node = canvas.current;
        if (!node) return;
        const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(animation); if (active) setStatus('error'); };
        node.addEventListener('webglcontextlost', lost);
        import('../lib/race-3d').then(module => {
            if (!active) return;
            scene = module.createRaceScene(node, track);
            let previous = performance.now() - 40;
            const draw = (now: number) => {
                if (!active) return;
                if (now - previous >= 30) {
                    try { scene!.render(worldRef.current, modeRef.current, Math.min(.1, (now - previous) / 1000)); }
                    catch { setStatus('error'); return; }
                    previous = now;
                }
                animation = requestAnimationFrame(draw);
            };
            setStatus('ready'); animation = requestAnimationFrame(draw);
        }).catch(() => { if (active) setStatus('error'); });
        return () => { active = false; cancelAnimationFrame(animation); node.removeEventListener('webglcontextlost', lost); scene?.dispose(); };
    }, [worldRef, retry, track]);

    async function fullscreen() {
        try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.current?.requestFullscreen(); setFullscreenError(''); }
        catch { setFullscreenError('No se ha podido abrir la pantalla completa.'); }
    }

    return <>
        <section className="panel race-world-panel" aria-label="Simulación 3D de los dos coches en pista">
            <div className="panel-heading"><div><h2><Video size={19} />Carrera en pista</h2><p>Una misma carrera · dos coches · movimiento calculado en directo</p></div><button type="button" className="secondary" onClick={fullscreen} aria-label="Ampliar simulación de carrera"><Expand size={18} /></button></div>
            <div className="race-camera-options" role="group" aria-label="Elegir cámara de la simulación">{cameraModes.map(option => <button type="button" key={option.id} aria-pressed={mode === option.id} onClick={() => setMode(option.id)}>{option.label}</button>)}</div>
            <div className="race-world-frame" ref={frame} data-renderer={status}>
                <canvas key={retry} ref={canvas} className="race-world-canvas" aria-label="Coche 1 blanco y Coche 2 negro y rojo compitiendo en el mismo circuito 3D" />
                {status === 'loading' && <div className="race-world-placeholder" role="status">Preparando la pista y los dos coches…</div>}
                {status === 'error' && <div className="race-world-placeholder"><p>La vista 3D no está disponible en este navegador. Los dos coches siguen corriendo en el circuito de abajo.</p><button type="button" className="secondary" onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>Reintentar 3D</button></div>}
                <div className="race-world-broadcast"><span><i className={running ? 'broadcast-dot' : ''} />{running ? 'SIMULACIÓN EN MARCHA' : 'CARRERA PAUSADA'}</span><strong>{time(world.elapsed)}</strong></div>
                <div className="race-world-timing" aria-label="Orden actual de carrera">{order.map((car, rank) => <div key={car.id}><b>{rank + 1}</b><span className={`race-mini-swatch ${car.id}`} /><span>Coche {car.id === 'car-1' ? '1' : '2'}</span><strong>{(car.speed * 3.6).toFixed(0)} <small>km/h</small></strong></div>)}</div>
                <aside className="race-camera-information" aria-label="Información del circuito">
                    <strong>{track.name}</strong><span>{Math.round(track.length).toLocaleString('es-ES')} m · {track.width.toLocaleString('es-ES')} m de ancho</span>
                    <span>{focus.id === 'car-1' ? 'MGRT · MG01' : 'RIVAL SIMULADO'}</span>
                    <div><b>{(focus.speed * 3.6).toFixed(0)}</b><span>km/h · V{Math.floor(focus.distance / track.length) + 1}</span></div>
                    <span>Motor {focus.motorTemp.toFixed(1)} °C · batería {focus.batteryTemp.toFixed(1)} °C</span>
                    <span>Vuelta {time(world.elapsed - focus.lapStarted)} · mejor {focus.bestLap === null ? '—' : time(focus.bestLap)}</span>
                    <span>Energía vuelta: {focus.consumptionWh.toFixed(2)} Wh</span>
                    {focus.lapHistory.length > 0 && <span>Última vuelta: {time(focus.lapHistory[0])} · {focus.lastLapWh?.toFixed(2) ?? '—'} Wh</span>}
                </aside>
                {mgTelemetry && <aside className="race-camera-telemetry" aria-label="Muestra importada de telemetría MGRT">
                    <strong>MGRT · TELEMETRÍA REAL</strong>
                    <span>{mgTelemetry.pilot} · t={time(mgTelemetry.time)}</span>
                    <div><b>{mgTelemetry.speed.toFixed(1)}</b><span>km/h GPS</span></div>
                    <span>Motor {mgTelemetry.motorTemp?.toFixed(1) ?? '—'} °C · batería {mgTelemetry.batteryTemp?.toFixed(1) ?? '—'} °C</span>
                    <span>Motor {mgTelemetry.motorRpm?.toLocaleString('es-ES') ?? '—'} rpm · rueda {mgTelemetry.wheelRpm?.toLocaleString('es-ES') ?? '—'} rpm</span>
                </aside>}
            </div>
            {track.elevation.hasElevation && <ElevationStrip world={world} track={track} />}
            {fullscreenError && <p className="race-media-note" role="status">{fullscreenError}</p>}
            <p className="race-media-note">Escena 3D interactiva, no vídeo grabado. Física simplificada con aceleración, frenada, curvas y consumo; sin conexión a coches ni cámaras reales.</p>
        </section>
        <div className="race-shared-overview">
            <section className="panel race-shared-track"><div className="panel-heading"><div><h2><Flag size={18} />{track.name}</h2><p>{Math.round(track.length)} m · posiciones de ambos coches</p></div></div><SharedCircuit world={world} track={track} /><div className="race-track-legend"><span><i className="race-mini-swatch car-1" />MGRT · MG01</span><span><i className="race-mini-swatch car-2" />Rival · datos simulados</span></div></section>
            <section className="panel race-classification"><div className="panel-heading"><div><h2>Clasificación en vivo</h2><p>Orden por distancia recorrida, incluyendo las vueltas completas</p></div></div>{order.map((car, rank) => <div className="race-position-row" key={car.id}><b>{rank + 1}</b><span className={`race-car-swatch ${car.id}`} /><div><strong>{car.id === 'car-1' ? 'MGRT · MG01' : 'Rival simulado'}</strong><small>Vuelta {Math.floor(car.distance / track.length) + 1} · {car.distance.toLocaleString('es-ES', { maximumFractionDigits: 0 })} m · última {car.lastLap === null ? '—' : time(car.lastLap)} · mejor {car.bestLap === null ? '—' : time(car.bestLap)}</small></div><span>{rank === 0 ? 'Líder' : `A ${(order[0].distance - car.distance).toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`}</span></div>)}<p className="race-media-note">El rival es una referencia generada localmente, no datos reales de otro equipo. La cámara, el mapa y las lecturas comparten el estado de carrera.</p></section>
        </div>
    </>;
}

function ElevationStrip({ world, track }: { world: RaceWorld; track: CircuitRuntime }) {
    const top = Math.max(track.elevation.range, 1), toY = (y: number) => 36 - y / top * 30;
    const line = track.outline.map((p, i) => `${(i / (track.outline.length - 1) * 100).toFixed(2)},${toY(p.y).toFixed(2)}`).join(' ');
    return <div className="race-elevation">
        <div className="race-elevation-heading"><strong>Perfil de altura</strong><span>{`${track.elevation.range.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m de desnivel · pendiente máx. ${(track.elevation.maxGrade * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}</span></div>
        <div className="race-elevation-chart">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Perfil de altura de la vuelta con la posición de los dos coches"><polygon points={`0,40 ${line} 100,40`} fill="var(--red)" opacity=".14" /><polyline points={line} fill="none" stroke="var(--red)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
            {world.cars.map((car, index) => { const progress = (car.distance % track.length) / track.length, p = track.point(progress); return <span key={car.id} className={`race-elevation-car race-mini-swatch ${car.id}`} style={{ left: `${progress * 100}%`, top: `${toY(p.y) / 40 * 100}%` }} title={`Coche ${index + 1} · ${p.y.toFixed(1)} m · ${(p.grade * 100).toFixed(1)} %`} />; })}
        </div>
        <div className="race-elevation-axis"><span>Meta</span><span>{Math.round(track.length)} m</span></div>
    </div>;
}

function SharedCircuit({ world, track }: { world: RaceWorld; track: CircuitRuntime }) {
    const id = useId(), start = track.point(0), scale = Math.max(1, track.bounds.span / 180);
    return <svg className="race-circuit-map race-shared-map" viewBox={track.viewBox} role="img" aria-label="Circuito con la posición de los dos coches en la misma carrera">
        <defs><pattern id={id} width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fff" /><rect width="1" height="1" fill="#252a30" /><rect x="1" y="1" width="1" height="1" fill="#252a30" /></pattern></defs>
        <polyline points={track.outline.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--border)" strokeWidth={11*scale} strokeLinejoin="round" />
        <polyline points={track.outline.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--surface)" strokeWidth={8*scale} strokeLinejoin="round" />
        <polyline points={track.outline.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--muted)" strokeWidth={.5*scale} strokeDasharray={`${2*scale} ${3*scale}`} />
        <rect x={start.x - 2*scale} y={start.z - 5*scale} width={4*scale} height={10*scale} fill={`url(#${id})`} transform={`rotate(${-start.heading * 180 / Math.PI},${start.x},${start.z})`} />
        <text x="0" y="0" textAnchor="middle" className="circuit-wordmark" style={{fontSize:18*scale,letterSpacing:3*scale}}>MGRT</text>
        {world.cars.map((car, index) => { const pose = vehiclePose(car, track); return <g key={car.id} className="race-shared-marker" data-car={car.id} transform={`translate(${pose.x},${pose.z})`}><circle r={2.2*scale} fill={index ? '#e33248' : '#fff'} stroke="#303944" strokeWidth={.5*scale}/><path d={`M0 0 L${(index?10:-10)*scale} ${-12*scale}`} stroke={index?'#e33248':'#637182'} strokeWidth={scale}/><g transform={`translate(${(index?10:-10)*scale},${-12*scale})`}><circle r={7*scale} fill={index?'#e33248':'#fff'} stroke={index?'#fff':'#303944'} strokeWidth={1.1*scale}/><text y={2.5*scale} textAnchor="middle" fill={index?'#fff':'#252b33'} fontSize={7*scale} fontWeight="bold">{index+1}</text></g><title>{`Coche ${index + 1} · vuelta ${Math.floor(car.distance / track.length) + 1}`}</title></g>; })}
    </svg>;
}
