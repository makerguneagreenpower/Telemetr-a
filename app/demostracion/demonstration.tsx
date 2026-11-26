'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { createCircuitRuntime, DEMO_TRACK, type CircuitRuntime } from '../../lib/circuits';
import { PlayerRace } from '../simulator';
import { pilotIdentity, SimulatorRanking, useSimulatorRanking } from '../simulator-ranking';
import { useCircuits } from '../use-circuits';

export default function Demonstration() {
    const library = useCircuits();
    const [trackId, setTrackId] = useState(DEMO_TRACK.id);
    const [players, setPlayers] = useState<1 | 2>(2);
    const [names, setNames] = useState(['', '']);
    const [round, setRound] = useState<{ track: CircuitRuntime; names: string[] } | null>(null);
    const [formError, setFormError] = useState('');
    const definition = library.circuits.find(circuit => circuit.id === trackId);
    const selectedTrack = useMemo(() => definition ? createCircuitRuntime(definition) : DEMO_TRACK, [definition]);
    const track = round?.track ?? selectedTrack;
    const ranking = useSimulatorRanking(track);

    function start(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const entrants = names.slice(0, players).map(name => name.trim());
        if (entrants.some(name => !name)) {
            setFormError('Escribe un nombre para cada jugador.');
            return;
        }
        if (new Set(entrants.map(pilotIdentity)).size !== entrants.length) {
            setFormError('Usa un nombre distinto para cada jugador.');
            return;
        }
        setFormError('');
        setRound({ track, names: entrants });
    }

    function finish() {
        setRound(null);
        setNames(['', '']);
    }

    return (
        <div className="simulator">
            {round ? (
                <>
                    <section className="panel simulator-setup" aria-label="Pilotos de la tanda">
                        <p>{round.names.map((name, index) => `J${index + 1} · ${name}`).join(' / ')}</p>
                        <button type="button" className="secondary" onClick={finish}>Terminar tanda</button>
                    </section>
                    <PlayerRace track={round.track} players={players} onBestLaps={laps => ranking.save(round.names, laps)} />
                </>
            ) : (
                <form className="panel simulator-setup simulator-registration" aria-label="Inscripción a la competición" onSubmit={start}>
                    <label>
                        Pista
                        <select value={track.id} onChange={event => setTrackId(event.target.value)}>
                            <option value={DEMO_TRACK.id}>{DEMO_TRACK.name}</option>
                            {library.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}
                        </select>
                    </label>
                    <label>
                        Jugadores
                        <select value={players} onChange={event => {
                            setPlayers(event.target.value === '1' ? 1 : 2);
                            setFormError('');
                        }}>
                            <option value={1}>1 jugador</option>
                            <option value={2}>2 jugadores · pantalla dividida</option>
                        </select>
                    </label>
                    {names.slice(0, players).map((name, index) => (
                        <label key={index}>
                            Nombre de J{index + 1}
                            <input required maxLength={60} value={name} onChange={event => {
                                const value = event.target.value;
                                setNames(current => current.map((entry, slot) => slot === index ? value : entry));
                                setFormError('');
                            }} />
                        </label>
                    ))}
                    <button type="submit" className="primary">Iniciar tanda</button>
                    {formError && <p className="notice" role="alert">{formError}</p>}
                    {library.error && <p className="notice" role="status">La biblioteca de circuitos no está disponible. Puedes usar la pista de demostración.</p>}
                </form>
            )}
            <SimulatorRanking track={track} results={ranking.results} error={ranking.error} />
        </div>
    );
}
