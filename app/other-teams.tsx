'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search, Sparkles, Users, X } from 'lucide-react';
import { io } from 'socket.io-client';
import CompetitionAnalysis from './competition-analysis';
import { filterTeamRows, parseCompetitionData, parseCompetitions, publicStatus, resultTime, searchText, teamRows, TEAMS_API, TEAMS_SITE, TEAMS_SOURCE_URL, type Competition, type CompetitionData } from '../lib/other-teams';

const dateLabel = (date: string) => date ? new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES') : 'Fecha no disponible';
const numberLabel = (value: number | null | undefined, decimals = 0) => value == null ? '—' : value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const PAGE_SIZE = 15;

export default function OtherTeams() {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [year, setYear] = useState('all');
    const [code, setCode] = useState('');
    const [query, setQuery] = useState('');
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const years = [...new Set(competitions.flatMap(c => c.startDate ? [c.startDate.slice(0, 4)] : []))].sort().reverse();
    const available = competitions.filter(c => (year === 'all' || c.startDate.startsWith(year)) && (!query.trim() || searchText(c.description).includes(searchText(query))));
    const competition = available.find(c => c.code === code) ?? available[0];

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        fetch('/api/other-teams/competitions', { signal: controller.signal, cache: 'no-store' }).then(async response => {
            const body = await response.json() as { competitions?: unknown; error?: string };
            if (!response.ok) throw new Error(body.error || 'No se pudieron consultar las competiciones.');
            const parsed = parseCompetitions(body.competitions);
            if (!controller.signal.aborted) setCompetitions(parsed);
        }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo consultar la fuente.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [revision]);

    return <section className="other-teams" aria-label="Equipos y resultados de otras competiciones">
        <div className="teams-source panel"><div><strong>Resultados publicados por NS Service</strong><p>Consulta equipos e inscripciones por competición. Las posiciones y las mediciones pertenecen a la prueba seleccionada.</p></div><a className="secondary" href={TEAMS_SOURCE_URL} target="_blank" rel="noopener noreferrer">Fuente original <ExternalLink size={16} /></a><button className="secondary" type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />Actualizar</button></div>
        <div className="teams-competition-filters panel">
            <label>Año<select value={year} onChange={e => setYear(e.target.value)}><option value="all">Todos los años</option>{years.map(y => <option key={y}>{y}</option>)}</select></label>
            <label>Buscar competición<div className="teams-search"><Search size={17} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre o circuito…" /></div></label>
            <label className="teams-competition-select">Competición<select value={competition?.code ?? ''} disabled={!available.length} onChange={e => setCode(e.target.value)}>{!available.length && <option value="">Sin competiciones</option>}{available.map(c => <option key={c.code} value={c.code}>{dateLabel(c.startDate)} · {c.description}</option>)}</select></label>
        </div>
        {error && <div className="entry-error" role="alert">{error}</div>}
        {loading && !competitions.length ? <p role="status" className="teams-loading">Consultando competiciones…</p> : competition ? <CompetitionResults key={competition.code} competition={competition} revision={revision} /> : !error && <div className="panel teams-empty"><Users size={30} /><h2>No hay competiciones para estos filtros</h2><button type="button" className="secondary" onClick={() => { setYear('all'); setQuery(''); }}>Limpiar filtros</button></div>}
        <p className="teams-attribution">Fuente: <a href={TEAMS_SOURCE_URL} target="_blank" rel="noopener noreferrer">NS Service · Greenpower</a>. Datos públicos de resultados; no son telemetría de motor, batería o consumo de los otros equipos.</p>
    </section>;
}

function CompetitionResults({ competition, revision }: { competition: Competition; revision: number }) {
    const [data, setData] = useState<CompetitionData | null>(null);
    const [phase, setPhase] = useState<'loading' | 'live' | 'error'>('loading');
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState('');
    const [unitKey, setUnitKey] = useState('');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [order, setOrder] = useState('rank');
    const [page, setPage] = useState(0);

    useEffect(() => {
        setPhase('loading');
        const socket = io(TEAMS_API, { query: { competitionCode: competition.code }, transports: ['websocket', 'polling'], timeout: 10000, reconnectionAttempts: 5, reconnectionDelay: 2000 });
        const timer = setTimeout(() => { setPhase('error'); setError('La fuente aún no ha enviado los resultados. Puedes actualizar o consultar la web original.'); }, 15000);
        socket.on('update', (payload: unknown) => {
            try {
                const next = parseCompetitionData(payload);
                if (next.code !== competition.code) return;
                clearTimeout(timer);
                setData(next);
                setUpdatedAt(new Date().toISOString());
                setPhase('live');
                setError('');
            } catch { setPhase('error'); setError('La fuente ha enviado datos que no se pueden interpretar. Se conservan los últimos resultados válidos.'); }
        });
        socket.on('connect_error', () => { setPhase('error'); setError('No se puede conectar con los resultados. Comprueba la conexión o abre la fuente original.'); });
        socket.on('disconnect', () => { setPhase('error'); setError('Conexión interrumpida. Intentando reconectar; los datos visibles son los últimos recibidos.'); });
        return () => { clearTimeout(timer); socket.removeAllListeners(); socket.disconnect(); };
    }, [competition.code, revision]);

    const unit = data?.units.find(u => `${u.eventId}:${u.id}` === unitKey) ?? data?.units[0];
    const rows = useMemo(() => data && unit ? teamRows(data, unit) : [], [data, unit]);
    const categories = [...new Set(rows.map(row => row.category).filter(Boolean))].sort();
    const filtered = useMemo(() => filterTeamRows(rows, query, category, order), [rows, query, category, order]);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pages - 1);
    const sourceLink = unit ? `${TEAMS_SITE}/results.php?${new URLSearchParams({ code: competition.code, eventId: unit.eventId, eventUnitId: unit.id })}` : `${TEAMS_SITE}/pruebas.php?code=${encodeURIComponent(competition.code)}`;
    const event = data?.events.find(e => e.id === unit?.eventId);

    return <>
        <div className="teams-selected-heading"><div><h2>{competition.description}</h2><p>{dateLabel(competition.startDate)}{unit && ` · ${event?.name || 'Prueba'} · ${unit.name} · ${publicStatus(unit.status)}`}</p></div><div className="teams-analysis-navigation">{data && <a className="secondary" href="#competition-analysis"><Sparkles size={16} />Ver análisis</a>}<span className={`teams-connection ${phase}`} role="status">{phase === 'live' ? 'Conectado a la fuente' : phase === 'loading' ? 'Conectando…' : 'Sin conexión actual'}</span></div></div>
        {error && <div className="entry-error" role="alert">{error}</div>}
        <div className="teams-result-filters panel">
            <label>Prueba<select value={unit ? `${unit.eventId}:${unit.id}` : ''} disabled={!data?.units.length} onChange={e => { setUnitKey(e.target.value); setCategory('all'); setPage(0); }}>{!data?.units.length && <option value="">Sin pruebas recibidas</option>}{data?.units.map(u => <option key={`${u.eventId}:${u.id}`} value={`${u.eventId}:${u.id}`}>{data.events.find(e => e.id === u.eventId)?.name || 'Prueba'} · {u.name}</option>)}</select></label>
            <label>Buscar equipo, centro o dorsal<div className="teams-search"><Search size={17} /><input type="search" value={query} placeholder="Ej.: MakerGunea, Storm Rider, 2…" onChange={e => { setQuery(e.target.value); setPage(0); }} /></div></label>
            <label>Categoría<select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">Todas las categorías</option>{category !== 'all' && !categories.includes(category) && <option value={category}>{category} · sin inscripciones</option>}{categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label>Ordenar por<select value={order} onChange={e => { setOrder(e.target.value); setPage(0); }}><option value="rank">Posición publicada</option><option value="team">Equipo · A–Z</option><option value="speed">Mayor velocidad</option><option value="distance">Mayor distancia</option></select></label>
        </div>
        <section className="panel teams-results" aria-label="Resultados de equipos">
            <div className="panel-heading"><div><h2>Equipos e inscripciones</h2><p>{filtered.length} de {rows.length} inscripciones{updatedAt && ` · Última recepción: ${new Date(updatedAt).toLocaleTimeString('es-ES')}`}</p></div><button type="button" className="secondary" onClick={() => { setQuery(''); setCategory('all'); setOrder('rank'); setPage(0); }}><X size={15} />Limpiar</button></div>
            {!data ? <p className="teams-loading" role="status">{phase === 'loading' ? 'Esperando los resultados de la competición…' : 'No hay resultados disponibles. Usa «Actualizar» para reintentar.'}</p> : !filtered.length ? <p className="teams-empty">{!unit ? 'La fuente no publica pruebas para esta competición.' : !rows.length ? 'Todavía no hay inscripciones en esta prueba.' : 'No hay equipos que coincidan con la búsqueda y los filtros.'}</p> : <div className="table-scroll"><table><thead><tr><th>POS.</th><th>DORSAL</th><th>EQUIPO / COCHE</th><th>CENTRO</th><th>CATEGORÍA</th><th>VUELTAS</th><th>TIEMPO</th><th>MEJOR VUELTA</th><th>DISTANCIA <span>km</span></th><th>VELOCIDAD <span>km/h</span></th><th>DIFERENCIA</th><th>INCIDENCIA</th></tr></thead><tbody>{filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(row => <tr key={`${row.eventId}:${row.id}`}><td>{row.result?.rank || '—'}</td><td>{row.bib || '—'}</td><td><strong>{row.team || '—'}</strong>{!row.result && <small className="teams-no-result">Sin resultado publicado</small>}</td><td>{row.school || '—'}</td><td>{row.category || '—'}</td><td>{numberLabel(row.result?.laps)}</td><td>{resultTime(row.result?.time)}</td><td>{resultTime(row.result?.bestLap, true)}</td><td>{numberLabel(row.result?.distance, 3)}</td><td>{numberLabel(row.result?.speed, 1)}</td><td>{row.result?.gap || '—'}</td><td>{row.result?.incident || '—'}</td></tr>)}</tbody></table></div>}
            <div className="pagination"><span>{filtered.length ? `Mostrando ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de ${filtered.length}` : 'Sin registros'}</span><div><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</button><span>{safePage + 1} / {pages}</span><button disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Siguiente</button></div></div>
        </section>
        {data && <CompetitionAnalysis competition={competition} data={data} updatedAt={updatedAt} />}
        <a className="text-button teams-result-link" href={sourceLink} target="_blank" rel="noopener noreferrer">Ver esta prueba en NS Service <ExternalLink size={16} /></a>
    </>;
}
