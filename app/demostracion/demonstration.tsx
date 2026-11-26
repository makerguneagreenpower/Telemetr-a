'use client';

import { useMemo, useState } from 'react';
import { createCircuitRuntime, DEMO_TRACK } from '../../lib/circuits';
import { PlayerRace } from '../simulator';
import { useCircuits } from '../use-circuits';

export default function Demonstration() {
    const library = useCircuits();
    const [trackId, setTrackId] = useState(DEMO_TRACK.id);
    const [players, setPlayers] = useState<1 | 2>(2);
    const definition = library.circuits.find(circuit => circuit.id === trackId);
    const track = useMemo(() => definition ? createCircuitRuntime(definition) : DEMO_TRACK, [definition]);

    return (
        <div className="simulator">
            <section className="panel simulator-setup" aria-label="Configuración de la competición">
                <label>
                    Pista
                    <select value={track.id} onChange={event => setTrackId(event.target.value)}>
                        <option value={DEMO_TRACK.id}>{DEMO_TRACK.name}</option>
                        {library.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}
                    </select>
                </label>
                <label>
                    Jugadores
                    <select value={players} onChange={event => setPlayers(event.target.value === '1' ? 1 : 2)}>
                        <option value={1}>1 jugador</option>
                        <option value={2}>2 jugadores · pantalla dividida</option>
                    </select>
                </label>
                {library.error && <p className="notice" role="status">La biblioteca de circuitos no está disponible. Puedes usar la pista de demostración.</p>}
            </section>
            <PlayerRace key={JSON.stringify([track.id, track.revision, players])} track={track} players={players} showRanking />
        </div>
    );
}
