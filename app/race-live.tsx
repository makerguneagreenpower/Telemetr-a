'use client';

import { useEffect, useState } from 'react';
import { Activity, Gauge, Pause, Play, Radio, RotateCcw, Thermometer, TriangleAlert, Zap } from 'lucide-react';
import { cars, type CarId } from '../lib/telemetry';
import { advanceRaceReadings, initialRaceReadings } from '../lib/race-simulation';
import RaceCockpit from './race-cockpit';

const format = (value: number, decimals = 1) => value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const timeLabel = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;

export default function RaceLive({ carId, onCarChange }: { carId: CarId; onCarChange: (carId: CarId) => void }) {
    const [readings, setReadings] = useState(() => initialRaceReadings(carId));
    const [running, setRunning] = useState(true);
    const current = readings[readings.length - 1];

    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => setReadings(old => advanceRaceReadings(old, carId)), 1000);
        return () => clearInterval(timer);
    }, [running, carId]);

    return <section className="race-live" aria-label="Simulación de carrera">
        <div className="race-controls panel">
            <div className="race-status" role="status"><Radio size={20} /><div><strong>{running ? 'Simulación en curso' : 'Simulación pausada'}</strong><p>Datos simulados · sin conexión al coche</p></div></div>
            <label className="race-car-select">Coche<select value={carId} onChange={e => onCarChange(e.target.value as CarId)}>{cars.map(car => <option key={car.id} value={car.id}>{car.name}</option>)}</select></label>
            <div className="race-control-actions">
                <button type="button" className="secondary" onClick={() => setRunning(value => !value)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pausar' : 'Continuar'}</button>
                <button type="button" className="secondary" onClick={() => setReadings(initialRaceReadings(carId))}><RotateCcw size={17} />Reiniciar</button>
            </div>
        </div>
        <p className="race-explanation">Vista de prueba con una lectura por segundo. Al superar un límite se enciende una alerta roja pulsante en la lectura correspondiente. El consumo muestra la energía acumulada de la simulación en Wh. Al cambiar de coche se inicia su escenario de prueba.</p>
        <div className="metrics-grid race-metrics">
            <LiveMetric label="TEMPERATURA DEL MOTOR" value={format(current.motorTemp)} unit="°C" limit={50} reading={current.motorTemp} icon={<Thermometer size={18} />} />
            <LiveMetric label="TEMPERATURA DE BATERÍAS" value={format(current.batteryTemp)} unit="°C" limit={40} reading={current.batteryTemp} icon={<Thermometer size={18} />} />
            <LiveMetric label="VELOCIDAD" value={format(current.speed)} unit="km/h" limit={40} reading={current.speed} icon={<Gauge size={18} />} />
            <LiveMetric label="CONSUMO ACUMULADO" value={format(current.consumptionWh, 2)} unit="Wh" limit={7} reading={current.consumptionWh} icon={<Zap size={18} />} />
        </div>
        <RaceCockpit reading={current} running={running} />
        <div className="race-bottom-note"><Activity size={16} /><span>Tiempo simulado: {timeLabel(current.time)} · {running ? 'Actualizando cada segundo' : 'Actualización pausada'}</span></div>
    </section>;
}

function LiveMetric({ label, value, unit, icon, reading, limit }: { label: string; value: string; unit: string; icon: React.ReactNode; reading: number; limit: number }) {
    const exceeded = reading > limit;
    return <article className={`metric race-reading${exceeded ? ' race-reading-over-limit' : ''}`}>
        <div className="metric-label">{label}{icon}</div>
        <div className="race-alert-status" role="status" aria-live="polite" aria-atomic="true">
            {exceeded && <span className="race-alert-badge"><span className="race-alert-light" aria-hidden="true" /><TriangleAlert size={14} aria-hidden="true" />Alerta</span>}
        </div>
        <div className="metric-value">{value}<span>{unit}</span></div>
        <p className="metric-note">{exceeded ? 'Límite superado' : 'Dentro del límite'} · {limit} {unit}</p>
        <p className="race-reading-source">Lectura simulada</p>
    </article>;
}
