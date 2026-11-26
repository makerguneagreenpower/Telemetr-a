'use client';

import { useEffect, useState } from 'react';
import type { CircuitRuntime } from '../lib/circuits';

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

export function useSimulatorRanking(track: CircuitRuntime) {
    const key = `greenpower.simulator.ranking.v1:${JSON.stringify([track.id, track.revision])}`;
    const [snapshot, setSnapshot] = useState<{ key: string; results: Result[] }>({ key, results: [] });
    const [error, setError] = useState('');

    useEffect(() => {
        function refresh() {
            try {
                setSnapshot({ key, results: readResults(key) });
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

    function save(names: string[], laps: readonly (number | null)[]) {
        try {
            const results = readResults(key);
            let improved = false;
            names.forEach((name, index) => {
                const seconds = laps[index];
                if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return;
                const existing = results.findIndex(row => pilotIdentity(row.name) === pilotIdentity(name));
                if (existing < 0) results.push({ name, seconds });
                else if (seconds < results[existing].seconds) results[existing] = { name, seconds };
                else return;
                improved = true;
            });
            if (improved) localStorage.setItem(key, JSON.stringify(results));
            setSnapshot({ key, results });
            setError('');
        } catch {
            setError('No se pudo guardar el tiempo en este navegador.');
        }
    }

    return { results: snapshot.key === key ? snapshot.results : [], error, save };
}

export function pilotIdentity(name: string) {
    return name.trim().normalize('NFC').toLocaleLowerCase('es');
}

export function SimulatorRanking({ track, results, error }: { track: CircuitRuntime; results: Result[]; error: string }) {
    const standings = [...results].sort((a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name, 'es'));

    return (
        <section className="panel simulator-ranking" aria-labelledby="simulator-ranking-title">
            <div>
                <h2 id="simulator-ranking-title">Ranking de vueltas · {track.name}</h2>
                <p>La mejor vuelta válida de cada participante se guarda automáticamente en este navegador por circuito.</p>
            </div>
            {error && <p role="alert">{error}</p>}
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
