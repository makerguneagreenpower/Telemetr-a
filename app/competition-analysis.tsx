'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Trophy, Zap } from 'lucide-react';
import { analyzeCompetition } from '../lib/competition-analysis';
import { resultTime, publicStatus, type Competition, type CompetitionData } from '../lib/other-teams';

const decimal = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

type AIResult = { text: string; generatedAt: string; snapshotAt: string; code: string };

export default function CompetitionAnalysis({ competition, data, updatedAt }: { competition: Competition; data: CompetitionData; updatedAt: string }) {
    const summary = useMemo(() => analyzeCompetition(data), [data]);
    const [availability, setAvailability] = useState<{ configured: boolean; signedIn: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<AIResult | null>(null);
    const pending = useRef<AbortController | null>(null);

    useEffect(() => {
        const ctrl = new AbortController();
        fetch('/api/other-teams/analyze', { signal: ctrl.signal, cache: 'no-store' }).then(async response => {
            if (!response.ok) throw new Error('No se pudo comprobar la conexión de IA.');
            const value = await response.json() as { configured: boolean; signedIn: boolean };
            if (!ctrl.signal.aborted) setAvailability(value);
        }).catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo consultar el servicio de IA.'); });
        return () => { ctrl.abort(); pending.current?.abort(); };
    }, []);

    async function generate() {
        pending.current?.abort();
        const ctrl = new AbortController();
        pending.current = ctrl;
        const snapshotAt = updatedAt;
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/other-teams/analyze', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: competition.description, data }), signal: ctrl.signal,
            });
            const body = await response.json() as { error?: string; text?: string; generatedAt?: string; code?: string };
            if (!response.ok) throw new Error(body.error || 'No se pudo generar el análisis.');
            if (!body.text || !body.generatedAt || body.code !== competition.code) throw new Error('La respuesta de IA no corresponde a esta competición.');
            if (!ctrl.signal.aborted) setResult({ text: body.text, generatedAt: body.generatedAt, snapshotAt, code: body.code });
        } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo generar el análisis.'); }
        finally { if (!ctrl.signal.aborted) setBusy(false); }
    }

    const canGenerate = availability?.configured && availability.signedIn;
    return <section id="competition-analysis" className="panel competition-analysis" aria-label="Análisis de la competición">
        <div className="panel-heading"><div><h2><Sparkles size={19} />Análisis de la competición</h2><p>Comparativa de todas las pruebas de {competition.description}. Los filtros de la tabla no modifican este resumen.</p></div><span className="analysis-kind">Resumen calculado</span></div>
        <div className="competition-analysis-body">
            <div className="analysis-method"><Trophy size={19} /><p>{summary.method}</p></div>
            {!summary.groups.length ? <p className="analysis-note">No hay pruebas con datos para comparar.</p> : <div className="table-scroll"><table className="pace-summary"><thead><tr><th>PRUEBA / CATEGORÍA</th><th>MÁS RITMO MEDIO</th><th>MEDIA <span>km/h</span></th><th>VUELTA RÁPIDA</th><th>COMPARABLES</th></tr></thead><tbody>{summary.groups.map(group => <tr key={`${group.eventId}:${group.unitId}:${group.category}`}>
                <td><strong>{group.name}</strong>{group.category && <small>{group.category}</small>}<small>{publicStatus(group.status)}</small></td>
                <td>{group.leaders.length ? group.leaders.map(leader => <span className="pace-leader" key={leader.id}>{leader.name}{leader.bib && ` · #${leader.bib}`}{leader.partial && <small>Resultado parcial / con incidencia</small>}</span>) : 'Datos insuficientes'}{group.leaders.length > 1 && <small>Empate de ritmo a dos decimales</small>}</td>
                <td>{group.leaders[0] ? decimal(group.leaders[0].paceKmh) : '—'}{group.advantagePercent != null && <small>+{decimal(group.advantagePercent)} % sobre el siguiente</small>}</td>
                <td>{group.fastestLap ? <>{group.fastestLap.name}<small>{resultTime(group.fastestLap.milliseconds, true)}</small></> : 'No publicada'}</td>
                <td>{group.comparable} de {group.registrations}</td>
            </tr>)}</tbody></table></div>}
            <div className="analysis-consumption"><Zap size={19} /><div><strong>¿Qué equipo consume más? Sin datos de Wh</strong><p>{summary.limitations[0]}</p></div></div>
            <p className="analysis-note">{summary.limitations[1]} {summary.limitations[2]}</p>
            <div className="competition-ai-conclusions">
                <div className="competition-ai-heading"><div><h3>Conclusiones con IA</h3><p>Interpretación de los resultados de esta competición, manteniendo separadas las pruebas y señalando los datos que faltan.</p></div><button type="button" className="primary" disabled={!canGenerate || busy || !summary.groups.some(group => group.comparable)} onClick={generate}><Sparkles size={16} />{busy ? 'Analizando…' : result ? 'Regenerar conclusiones' : 'Generar conclusiones'}</button></div>
                {!availability && !error && <p className="analysis-note" role="status">Comprobando disponibilidad de IA…</p>}
                {availability && !availability.configured && <p className="analysis-note">La IA está pendiente de conexión. La comparativa calculada de arriba ya está disponible; no es un informe generado por IA.</p>}
                {availability?.configured && !availability.signedIn && <p className="analysis-note"><a href="/acceso">Inicia sesión</a> para generar las conclusiones con IA.</p>}
                {error && <div className="entry-error" role="alert">{error}</div>}
                {result && <div className="analysis-generated"><span className="analysis-kind">Generado por IA</span><p className="analysis-snapshot">Datos recibidos a las {new Date(result.snapshotAt).toLocaleTimeString('es-ES')} · generado a las {new Date(result.generatedAt).toLocaleTimeString('es-ES')}. No se actualiza automáticamente con nuevas lecturas.</p><p className="analysis-generated-text">{result.text}</p></div>}
            </div>
        </div>
    </section>;
}
