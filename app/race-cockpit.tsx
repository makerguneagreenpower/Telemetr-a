'use client';

import type { RaceVehicle } from '../lib/race-engine';
import { LAP_DISTANCE_METRES } from '../lib/race-track';

const lapClock = (seconds: number | null) => seconds === null ? '—' : `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

export default function RaceCockpit({ car, elapsed }: { car: RaceVehicle; elapsed: number }) {
    const speed = car.speed * 3.6, rpm = Math.round(car.speed * 3.6 * 64);
    const progress = (car.distance % LAP_DISTANCE_METRES) / LAP_DISTANCE_METRES;
    return <section className="panel race-car-instruments" aria-label={`Instrumentación simulada de ${car.id === 'car-1' ? 'Coche 1' : 'Coche 2'}`}>
        <div className="race-instruments-hud">
            <div className="hud-gauge"><Dial value={speed} maximum={60} label="km/h" alert={speed > 40} /><span className="hud-gauge-caption">VELOCIDAD</span></div>
            <div className="hud-speed"><span className="hud-lap">VUELTA {(Math.floor(car.distance / LAP_DISTANCE_METRES) + 1).toString().padStart(2, '0')}</span><div><strong className={speed > 40 ? 'hud-alert-value' : ''}>{Math.round(speed)}</strong><span>km/h</span><b title="Transmisión eléctrica de una relación">D</b></div><span className="hud-electric">ELÉCTRICO · MODELO SIMULADO</span></div>
            <div className="hud-controls"><div className="hud-pedal"><span>ACEL.</span><div><i style={{ height: `${car.throttle * 100}%` }} /></div></div><div className="hud-pedal hud-brake"><span>FRENO</span><div><i style={{ height: `${car.brake * 100}%` }} /></div></div><svg viewBox="0 0 48 48" className="hud-steering" style={{ transform: `rotate(${car.steering * 65}deg)` }} role="img" aria-label="Dirección simulada"><circle cx="24" cy="24" r="18" /><path d="M7 22h34M24 23v19M16 23l8-6 8 6" /><circle cx="24" cy="24" r="4" /></svg></div>
            <div className="hud-gauge"><Dial value={rpm} maximum={4000} label="×1000 rpm" alert={false} /><span className="hud-gauge-caption">MOTOR · {rpm.toLocaleString('es-ES')} RPM SIM.</span></div>
        </div>
        <div className="race-track-progress"><span>Progreso de vuelta</span><strong>{Math.floor(progress * 100)} %</strong><progress max={1} value={progress} aria-label="Progreso de vuelta del coche" /></div>
        <div className="race-track-facts"><div><span>Vuelta actual</span><strong>{lapClock(elapsed - car.lapStarted)}</strong></div><div><span>Última vuelta</span><strong>{lapClock(car.lastLap)}</strong></div><div><span>Mejor vuelta</span><strong>{lapClock(car.bestLap)}</strong></div></div>
        <p className="race-media-note">Dos baterías traseras · {Math.round(car.powerW)} W de potencia eléctrica simulada · mismo reloj que la escena 3D.</p>
    </section>;
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
