'use client';

import { useEffect, useRef, useState } from 'react';
import { Expand, Play, RotateCcw, Video } from 'lucide-react';
import type { RaceReading } from '../lib/race-simulation';
import { drivingState, LAP_DISTANCE_METRES, LAP_SECONDS, lapProgress, TRACK_OUTLINE, TRACK_VIEWBOX, trackPoint } from '../lib/race-track';
import { drawRaceFrame } from '../lib/race-scene';

const clipTime = (time: number) => ((time % LAP_SECONDS) + LAP_SECONDS) % LAP_SECONDS;
const clock = (time: number) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`;

export default function RaceCockpit({ reading, running }: { reading: RaceReading; running: boolean }) {
    const video = useRef<HTMLVideoElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const frame = useRef<HTMLDivElement>(null);
    const [frameTime, setFrameTime] = useState(() => clipTime(reading.time));
    const [videoError, setVideoError] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [fullscreenError, setFullscreenError] = useState('');
    const controls = drivingState(frameTime);
    const progress = lapProgress(frameTime);
    const position = trackPoint(progress);
    const lap = Math.floor(reading.time / LAP_SECONDS) + 1;
    const rpm = Math.round(reading.speed * 64);

    useEffect(() => {
        const player = video.current;
        if (!player || videoError) return;
        const synchronize = () => {
            const target = Math.min(clipTime(reading.time), (Number.isFinite(player.duration) ? player.duration : LAP_SECONDS) - .05);
            const difference = Math.abs(player.currentTime - target);
            if (Math.min(difference, LAP_SECONDS - difference) > .65) player.currentTime = Math.max(0, target);
            if (!running) { player.pause(); setBlocked(false); }
            else if (player.paused) player.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
        };
        if (player.readyState >= 1) synchronize();
        player.addEventListener('loadedmetadata', synchronize);
        return () => player.removeEventListener('loadedmetadata', synchronize);
    }, [reading.time, running, videoError]);

    useEffect(() => {
        if (!videoError) return;
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        const started = performance.now();
        let id = 0, last = -100;
        const render = (now: number) => {
            if (now - last > 80) {
                const time = reading.time + (running ? Math.min((now - started) / 1000, 1) : 0);
                drawRaceFrame(context, time, 960, 540);
                setFrameTime(clipTime(time));
                last = now;
            }
            if (running) id = requestAnimationFrame(render);
        };
        id = requestAnimationFrame(render);
        return () => cancelAnimationFrame(id);
    }, [videoError, reading.time, running]);

    async function fullscreen() {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await frame.current?.requestFullscreen();
            setFullscreenError('');
        } catch { setFullscreenError('La pantalla completa no está disponible en este navegador.'); }
    }

    return <div className="race-cockpit-grid">
        <section className="panel race-camera" aria-label="Cámara de demostración y panel de instrumentos">
            <div className="panel-heading"><div><h2><Video size={18} />Cámara a bordo</h2><p>Vuelta de referencia de 60 segundos · simulación renderizada · en bucle</p></div><button type="button" className="secondary race-fullscreen" onClick={fullscreen} aria-label="Ampliar cámara"><Expand size={17} /></button></div>
            <div className="race-camera-frame" ref={frame}>
                {videoError ? <canvas ref={canvas} width={960} height={540} className="race-camera-image" aria-label="Vista animada de respaldo del circuito simulado" /> : <video ref={video} className="race-camera-image" src="/race-lap-simulation.webm" poster="/race-lap-poster.jpg" autoPlay muted playsInline loop preload="auto" onTimeUpdate={e => setFrameTime(clipTime(e.currentTarget.currentTime))} onError={() => setVideoError(true)} aria-label="Vídeo simulado de una vuelta de un minuto; no es una cámara real" />}
                <div className="race-camera-tags"><span>DEMO · CÁMARA SIMULADA</span><span>{clock(frameTime)} / 01:00</span></div>
                {blocked && <button type="button" className="race-camera-start" onClick={() => video.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))}><Play size={18} />Reproducir cámara</button>}
                <div className="driving-hud" aria-label="Instrumentación de conducción simulada">
                    <div className="hud-gauge"><Dial value={reading.speed} maximum={60} label="km/h" alert={reading.speed > 40} /><span className="hud-gauge-caption">VELOCIDAD</span></div>
                    <div className="hud-speed"><span className="hud-lap">VUELTA {lap.toString().padStart(2, '0')}</span><div><strong className={reading.speed > 40 ? 'hud-alert-value' : ''}>{Math.round(reading.speed)}</strong><span>km/h</span><b title="Transmisión eléctrica de una relación">D</b></div><span className="hud-electric">ELÉCTRICO · MANDOS SIMULADOS</span></div>
                    <div className="hud-controls"><div className="hud-pedal"><span>ACEL.</span><div><i style={{ height: `${controls.throttle * 100}%` }} /></div></div><div className="hud-pedal hud-brake"><span>FRENO</span><div><i style={{ height: `${controls.brake * 100}%` }} /></div></div><svg viewBox="0 0 48 48" className="hud-steering" style={{ transform: `rotate(${controls.steering * 65}deg)` }} role="img" aria-label="Dirección simulada"><circle cx="24" cy="24" r="18" /><path d="M7 22h34M24 23v19M16 23l8-6 8 6" /><circle cx="24" cy="24" r="4" /></svg></div>
                    <div className="hud-gauge"><Dial value={rpm} maximum={4000} label="×1000 rpm" alert={false} /><span className="hud-gauge-caption">MOTOR · {rpm.toLocaleString('es-ES')} RPM SIM.</span></div>
                </div>
            </div>
            <div className="race-camera-caption"><span>{running ? 'Reproducción sincronizada con la simulación' : 'Reproducción pausada'}</span>{videoError && <button type="button" className="text-button" onClick={() => setVideoError(false)}><RotateCcw size={14} />Reintentar vídeo</button>}</div>
            {fullscreenError && <p className="race-media-note" role="status">{fullscreenError}</p>}
            <p className="race-media-note">Vista de prueba creada por renderizado, sin cámara ni GPS reales. La generación del clip con IA está pendiente de conectar el servicio de vídeo.</p>
        </section>
        <section className="panel race-track-panel" aria-label="Circuito y posición simulada del coche">
            <div className="panel-heading"><div><h2>Circuito</h2><p>Posición sincronizada con la vuelta del vídeo</p></div><span className="race-map-status">SIMULADO</span></div>
            <svg viewBox={TRACK_VIEWBOX} className="race-circuit-map" role="img" aria-label="Trazado de demostración con la posición simulada del coche">
                <defs><pattern id="circuit-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--border)" strokeWidth=".3" /></pattern><pattern id="finish-line" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fff" /><rect width="1" height="1" fill="#252a30" /><rect x="1" y="1" width="1" height="1" fill="#252a30" /></pattern></defs>
                <rect x="-110" y="-105" width="220" height="210" fill="url(#circuit-grid)" />
                <text x="0" y="0" textAnchor="middle" className="circuit-wordmark">MGRT</text>
                <polyline points={TRACK_OUTLINE.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--border)" strokeWidth="11" strokeLinejoin="round" />
                <polyline points={TRACK_OUTLINE.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--surface)" strokeWidth="8" strokeLinejoin="round" />
                <polyline points={TRACK_OUTLINE.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--muted)" strokeWidth=".5" strokeDasharray="2 3" />
                <rect x={trackPoint(0).x - 2} y={trackPoint(0).z - 5} width="4" height="10" fill="url(#finish-line)" transform={`rotate(${-trackPoint(0).heading * 180 / Math.PI},${trackPoint(0).x},${trackPoint(0).z})`} />
                <circle cx={position.x} cy={position.z} r="7" fill="var(--red)" opacity=".17" />
                <circle className="race-track-car" cx={position.x} cy={position.z} r="3.5" fill="var(--red)" stroke="var(--panel)" strokeWidth="1.4"><title>Posición simulada del coche</title></circle>
            </svg>
            <div className="race-track-progress"><span>Vuelta {lap}</span><strong>{Math.floor(progress * 100)} %</strong><progress max={1} value={progress} aria-label="Progreso de la vuelta simulada" /></div>
            <div className="race-track-facts"><div><span>Longitud virtual</span><strong>{Math.round(LAP_DISTANCE_METRES)} m</strong></div><div><span>Duración del clip</span><strong>01:00</strong></div><div><span>Posición</span><strong>{running ? 'Actualizando' : 'Pausada'}</strong></div></div>
            <p className="race-media-note">Trazado de demostración. No representa un circuito real.</p>
        </section>
    </div>;
}

function Dial({ value, maximum, label, alert }: { value: number; maximum: number; label: string; alert: boolean }) {
    const ratio = Math.max(0, Math.min(1, value / maximum));
    const point = (r: number, t: number) => { const a = (-210 + t * 240) * Math.PI / 180; return { x: 70 + r * Math.cos(a), y: 65 + r * Math.sin(a) }; };
    const first = point(50, 0), last = point(50, 1), end = point(42, ratio);
    return <svg viewBox="0 0 140 105" className="hud-dial" role="img" aria-label={`${label}: ${Math.round(value)}`}>
        <path d={`M${first.x},${first.y} A50,50 0 1,1 ${last.x},${last.y}`} pathLength="100" fill="none" stroke="#ffffff38" strokeWidth="3" />
        <path d={`M${first.x},${first.y} A50,50 0 1,1 ${last.x},${last.y}`} pathLength="100" fill="none" stroke={alert ? '#ff6376' : '#f5f5f7'} strokeWidth="3" strokeDasharray={`${ratio * 100} 100`} />
        {Array.from({ length: 7 }, (_, i) => { const a = point(46, i / 6), b = point(50, i / 6), text = point(35, i / 6); return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dce0e8" strokeWidth="1" /><text x={text.x} y={text.y + 2} textAnchor="middle" fill="#e9edf5" fontSize="7">{maximum === 4000 ? (i * 4 / 6).toFixed(i % 3 ? 1 : 0) : i * 10}</text></g>; })}
        <line x1="70" y1="65" x2={end.x} y2={end.y} stroke="#ff6376" strokeWidth="2" /><circle cx="70" cy="65" r="4" fill="#f5f5f7" /><text x="70" y="95" textAnchor="middle" fill="#e9edf5" fontSize="8">{label}</text>
    </svg>;
}
