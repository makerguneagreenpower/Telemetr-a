'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Expand, Flag, Video } from 'lucide-react';
import { raceOrder, vehiclePose, type RaceWorld } from '../lib/race-engine';
import { LAP_DISTANCE_METRES, TRACK_OUTLINE, TRACK_VIEWBOX, trackPoint } from '../lib/race-track';
import type { RaceCamera } from '../lib/race-3d';

const cameraModes: { id: RaceCamera; label: string }[] = [{ id: 'duel', label: 'Los dos coches' }, { id: 'car-1', label: 'A bordo · 01' }, { id: 'car-2', label: 'A bordo · 02' }, { id: 'aerial', label: 'Vista aérea' }];
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function RaceWorldView({ worldRef, world, running }: { worldRef: RefObject<RaceWorld>; world: RaceWorld; running: boolean }) {
    const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<RaceCamera>('duel');
    const modeRef = useRef(mode);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [retry, setRetry] = useState(0), [fullscreenError, setFullscreenError] = useState('');
    const order = raceOrder(world);
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
            scene = module.createRaceScene(node);
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
    }, [worldRef, retry]);

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
            </div>
            {fullscreenError && <p className="race-media-note" role="status">{fullscreenError}</p>}
            <p className="race-media-note">Escena 3D interactiva, no vídeo grabado. Física simplificada con aceleración, frenada, curvas y consumo; sin conexión a coches ni cámaras reales.</p>
        </section>
        <div className="race-shared-overview">
            <section className="panel race-shared-track"><div className="panel-heading"><div><h2><Flag size={18} />Circuito compartido</h2><p>{Math.round(LAP_DISTANCE_METRES)} m · posiciones de ambos coches</p></div></div><SharedCircuit world={world} /><div className="race-track-legend"><span><i className="race-mini-swatch car-1" />Coche 1 · blanco</span><span><i className="race-mini-swatch car-2" />Coche 2 · negro/rojo</span></div></section>
            <section className="panel race-classification"><div className="panel-heading"><div><h2>Clasificación en vivo</h2><p>Orden por distancia recorrida, incluyendo las vueltas completas</p></div></div>{order.map((car, rank) => <div className="race-position-row" key={car.id}><b>{rank + 1}</b><span className={`race-car-swatch ${car.id}`} /><div><strong>Coche {car.id === 'car-1' ? '1' : '2'}</strong><small>Vuelta {Math.floor(car.distance / LAP_DISTANCE_METRES) + 1} · {car.distance.toLocaleString('es-ES', { maximumFractionDigits: 0 })} m recorridos</small></div><span>{rank === 0 ? 'Líder' : `A ${(order[0].distance - car.distance).toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`}</span></div>)}<p className="race-media-note">Las diferencias de ritmo cambian con las curvas y la entrega de potencia de cada coche. La cámara, el mapa y las lecturas comparten el mismo estado de carrera.</p></section>
        </div>
    </>;
}

function SharedCircuit({ world }: { world: RaceWorld }) {
    const id = useId(), start = trackPoint(0);
    return <svg className="race-circuit-map race-shared-map" viewBox={TRACK_VIEWBOX} role="img" aria-label="Circuito con la posición de los dos coches en la misma carrera">
        <defs><pattern id={id} width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fff" /><rect width="1" height="1" fill="#252a30" /><rect x="1" y="1" width="1" height="1" fill="#252a30" /></pattern></defs>
        <polyline points={TRACK_OUTLINE.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--border)" strokeWidth="11" strokeLinejoin="round" />
        <polyline points={TRACK_OUTLINE.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--surface)" strokeWidth="8" strokeLinejoin="round" />
        <polyline points={TRACK_OUTLINE.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--muted)" strokeWidth=".5" strokeDasharray="2 3" />
        <rect x={start.x - 2} y={start.z - 5} width="4" height="10" fill={`url(#${id})`} transform={`rotate(${-start.heading * 180 / Math.PI},${start.x},${start.z})`} />
        <text x="0" y="0" textAnchor="middle" className="circuit-wordmark">MGRT</text>
        {world.cars.map((car, index) => { const pose = vehiclePose(car); return <g key={car.id} className="race-shared-marker" data-car={car.id} transform={`translate(${pose.x},${pose.z})`}><circle r="7" fill={index ? '#e33248' : '#fff'} stroke={index ? '#fff' : '#303944'} strokeWidth="1.1" /><text y="2.5" textAnchor="middle" fill={index ? '#fff' : '#252b33'} fontSize="7" fontWeight="bold">{index + 1}</text><title>{`Coche ${index + 1} · vuelta ${Math.floor(car.distance / LAP_DISTANCE_METRES) + 1}`}</title></g>; })}
    </svg>;
}
