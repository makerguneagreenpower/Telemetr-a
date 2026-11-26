'use client';

import { useEffect, useState } from 'react';
import type { CircuitRuntime } from '../lib/circuits';
import type { RaceVehicle } from '../lib/race-engine';

type Result = { name: string; seconds: number };

function readResults(key: string): Result[] {
    const records: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(records)) return [];
    return records.filter((row): row is Result =>
        row !== null && typeof row === 'object' && typeof row.name === 'string' &&
        row.name.trim().length > 0 && Number.isFinite(row.seconds) && row.seconds > 0,
    );
}

function formatTime(seconds: number) {
    const hundredths = Math.round(seconds * 100);
    return `${Math.floor(hundredths / 6000)}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}

export function SimulatorRanking({ track, cars }: { track: CircuitRuntime; cars: RaceVehicle[] }) {
    const key = `greenpower.simulator.ranking.v1:${JSON.stringify([track.id, track.revision])}`;
    const [names, setNames] = useState(['', '']);
    const [results, setResults] = useState<Result[]>([]);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        function refresh() {
            try {
                setResults(readResults(key));
                setError('');
            } catch {
                setError('No se pudo leer el ranking guardado en este navegador.');
            }
        }
        refresh();
        function sync(event: StorageEvent) {
            if (event.key === key || event.key === null) refresh();
        }
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, [key]);

    function save(index: number) {
        const name = names[index].trim();
        const seconds = cars[index].bestLap;
        if (!name || seconds === null || !Number.isFinite(seconds) || seconds <= 0) return;

        try {
            const updated = readResults(key);
            const identity = name.toLocaleLowerCase('es');
            const existing = updated.findIndex(row => row.name.toLocaleLowerCase('es') === identity);
            if (existing < 0) updated.push({ name, seconds });
            else if (seconds < updated[existing].seconds) updated[existing] = { name, seconds };
            else {
                setResults(updated);
                setError('');
                setMessage(`${name} ya tiene un tiempo igual o mejor.`);
                return;
            }
            localStorage.setItem(key, JSON.stringify(updated));
            setResults(updated);
            setError('');
            setMessage(`Vuelta de ${name} guardada en ${formatTime(seconds)}.`);
        } catch {
            setMessage('');
            setError('No se pudo guardar el tiempo en este navegador.');
        }
    }

    const standings = [...results].sort((a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name, 'es'));

    return (
        <section className="panel simulator-ranking" aria-labelledby="simulator-ranking-title">
            <div>
                <h2 id="simulator-ranking-title">Ranking de vueltas · {track.name}</h2>
                <p>Guarda la mejor vuelta válida de cada participante. Reinicia la carrera antes de cambiar de pilotos. El ranking se guarda en este navegador por circuito.</p>
            </div>
            <div className="simulator-ranking-entries">
                {cars.map((car, index) => (
                    <form key={car.id} onSubmit={event => { event.preventDefault(); save(index); }}>
                        <label>
                            Nombre de J{index + 1}
                            <input value={names[index]} maxLength={60} onChange={event => {
                                const name = event.target.value;
                                setNames(current => current.map((value, slot) => slot === index ? name : value));
                            }} />
                        </label>
                        <button type="submit" className="secondary" disabled={!names[index].trim() || car.bestLap === null}>
                            Guardar J{index + 1}{car.bestLap === null ? '' : ` · ${formatTime(car.bestLap)}`}
                        </button>
                    </form>
                ))}
            </div>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {standings.length ? (
                <table aria-label="Clasificación por mejor vuelta">
                    <thead><tr><th scope="col">Puesto</th><th scope="col">Participante</th><th scope="col">Mejor vuelta</th></tr></thead>
                    <tbody>{standings.map((row, index) => (
                        <tr key={row.name}><td>{index + 1}</td><th scope="row">{row.name}</th><td>{formatTime(row.seconds)}</td></tr>
                    ))}</tbody>
                </table>
            ) : <p>Todavía no hay tiempos guardados.</p>}
        </section>
    );
}
