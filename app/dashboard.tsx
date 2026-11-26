'use client';
import { useEffect, useMemo, useRef, useState, lazy, Suspense, type ReactNode } from 'react';
import { Activity, LayoutDashboard, MapPinned, Flag, Upload, ChevronRight, Gauge, Zap, Play, Pause, X, LogIn, Timer, FileSpreadsheet, Users, Radio, Settings2, Trash2, Gamepad2, Database } from 'lucide-react';
import { demoSessions, cars, stages, sessionsFor, isUnclassified, stats, type Session, type Sample, type CarId, type SessionContext } from '../lib/telemetry';
import 'leaflet/dist/leaflet.css';
import DataEntry, { type SessionInput } from './data-entry';
import RaceArchive from './race-archive';
import { CarComponents, PartDetails, parts, type PartId } from './car-components';
import { Dialog } from 'radix-ui';
import { useTheme } from 'next-themes';
import RaceLive from './race-live';
const OtherTeams = lazy(() => import('./other-teams'));
const CircuitsEditor = lazy(() => import('./circuits-editor'));
const Simulator = lazy(() => import('./simulator'));
const DatabaseArchive = lazy(() => import('./database-archive'));
const fmt = (n: number | null | undefined, d = 1) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const clock = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;
function TrackMap({ rows, index }: { rows: Sample[]; index: number }) {
    const { resolvedTheme } = useTheme();
    const node = useRef<HTMLDivElement>(null), map = useRef<import('leaflet').Map | null>(null), marker = useRef<import('leaflet').CircleMarker | null>(null); const [error, setError] = useState(false);
    useEffect(() => {
        let active = true; import('leaflet').then(L => {
            if (!active || !node.current) return; const m = L.map(node.current, { zoomControl: false, attributionControl: true }); map.current = m; L.control.zoom({ position: 'bottomright' }).addTo(m); L.tileLayer(`https://{s}.basemaps.cartocdn.com/${resolvedTheme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }).on('tileerror', () => setError(true)).addTo(m);
            const points = rows.filter(r => r.lat !== null && r.lng !== null).map(r => [r.lat!, r.lng!] as [number, number]); if (points.length) { L.polyline(points, { color: '#ed3545', weight: 4, opacity: .9 }).addTo(m); marker.current = L.circleMarker(points[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#f03645', fillOpacity: 1 }).addTo(m); m.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 16 }); } else m.setView([40.4168, -3.7038], 12);
            requestAnimationFrame(() => { if (active) m.invalidateSize(); });
        }); return () => { active = false; map.current?.remove(); map.current = null; marker.current = null; };
    }, [rows, resolvedTheme]);
    useEffect(() => { const row = rows[index]; if (row?.lat !== null && row?.lng !== null && row?.lat !== undefined) marker.current?.setLatLng([row.lat, row.lng!]); }, [index, rows]);
    return <div className="map-wrap"><div ref={node} className="map" />{!rows.some(r => r.lat !== null) && <div className="map-note">Este archivo no contiene coordenadas GPS.</div>}{error && <span className="tile-note">Mapa base no disponible · recorrido GPS visible</span>}<div className="map-key"><span className="red-dot" /> Recorrido GPS <span className="car-dot" /> Coche</div></div>;
}
export default function Dashboard({ user, initialView = 'inicio' }: { user: { name: string; email: string } | null; initialView?: string }) {
    const [view, setView] = useState(initialView), [sessions, setSessions] = useState<Session[]>(demoSessions), [sid, setSid] = useState(demoSessions[0].id), [car, setCar] = useState<CarId | 'unassigned'>('car-1'), [day, setDay] = useState('2026-10-08'), [context, setContext] = useState<SessionContext>('race-day'), [stageId, setStageId] = useState<string>(stages[0].id), [pilot, setPilot] = useState('Todos los pilotos'), [cursor, setCursor] = useState(0), [playing, setPlaying] = useState(false), [modal, setModal] = useState<'login' | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [analysis, setAnalysis] = useState(''), [page, setPage] = useState(0), [loading, setLoading] = useState(false), [removed, setRemoved] = useState<string[]>([]), [deletePilot, setDeletePilot] = useState<string | null>(null), [deleteError, setDeleteError] = useState('');
    const stage = stages.find(s => s.id === stageId) ?? stages[0];
    const days = Array.from(new Set(sessions.flatMap(s => (s.sessionContext ?? 'race-day') === context && s.eventDate ? [s.eventDate] : []))).sort().reverse();
    const carSessions = sessionsFor(sessions, car, day, stage, context);
    const session = carSessions.find(s => s.id === sid) ?? carSessions[0];
    const pilots = Array.from(new Set((session?.samples ?? []).map(r => r.pilot))).filter(p => !removed.includes(p));
    const rows = useMemo(() => pilot === 'Todos los pilotos' ? (session?.samples ?? []) : (session?.samples ?? []).filter(r => r.pilot === pilot), [session?.samples, pilot]);
    const metrics = useMemo(() => stats(rows), [rows]);
    const current = rows[Math.min(cursor, rows.length - 1)];
    const pages = Math.max(1, Math.ceil(rows.length / 8));
    useEffect(() => {
        if (!user) return;
        const ctrl = new AbortController();
        setLoading(true);
        fetch('/api/sessions', { signal: ctrl.signal })
            .then(async r => {
                const d: unknown = await r.json().catch(() => null);
                if (!r.ok) {
                    const detail = d && typeof d === 'object' && 'error' in d ? d.error : null;
                    throw new Error(typeof detail === 'string' ? detail : `Error ${r.status} al cargar las sesiones.`);
                }
                if (!Array.isArray(d)) throw new Error('Respuesta inesperada del servidor.');
                if (ctrl.signal.aborted) return;
                setSessions(old => [...demoSessions, ...d, ...old.filter(s => !s.demo && !d.some(item => item.id === s.id))]);
            })
            .catch(e => { if (!ctrl.signal.aborted) setMessage(e.message || 'No se pudieron cargar las sesiones.'); })
            .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
        return () => ctrl.abort();
    }, [user]);
    useEffect(() => {
        if (!user) return;
        const ctrl = new AbortController();
        fetch('/api/pilots', { signal: ctrl.signal }).then(async r => {
            const d = await r.json() as { removed: string[]; error?: string };
            if (!r.ok) throw new Error(d.error ?? 'No se pudieron cargar los pilotos.');
            if (!ctrl.signal.aborted) setRemoved(d.removed);
        }).catch(e => { if (!ctrl.signal.aborted) setMessage(e.message); });
        return () => ctrl.abort();
    }, [user]);
    useEffect(() => {
        if (!playing || !rows.length) return;
        const t = setInterval(() => setCursor(c => Math.min(c + 1, rows.length - 1)), 250);
        return () => clearInterval(t);
    }, [playing, rows.length]);
    useEffect(() => {
        if (playing && cursor >= rows.length - 1) setPlaying(false);
    }, [cursor, playing, rows.length]);
    useEffect(() => { setCursor(0); setPlaying(false); setPage(0); setAnalysis(''); }, [sid, pilot, car, day, stageId, context]);
    function changeSession(id: string) { setSid(id); setPilot('Todos los pilotos'); }
    function changeCar(id: CarId | 'unassigned') { setCar(id); setPilot('Todos los pilotos'); }
    function changeStage(id: string) { setStageId(id); setPilot('Todos los pilotos'); }
    function changeDay(date: string) { setDay(date); setPilot('Todos los pilotos'); }
    function changeContext(next: SessionContext) { setContext(next); setPilot('Todos los pilotos'); const dates = sessions.filter(s => (s.sessionContext ?? 'race-day') === next && s.eventDate).map(s => s.eventDate!).sort().reverse(); if (!dates.includes(day) && dates.length) setDay(dates[0]); }
    function openUpload() { setView('entrada'); }
    async function saveSession(input: SessionInput) { const r = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); const d = await r.json() as Session & { error?: string }; if (!r.ok) throw new Error(d.error ?? 'No se pudo guardar la sesión.'); setSessions(s => [...s, d]); setCar(d.carId!); setDay(d.eventDate!); setContext(d.sessionContext); if (d.sessionContext === 'race-day') { const st = stages.find(stage => stage.category === d.carCategory && stage.type === d.sessionType); if (st) setStageId(st.id); } changeSession(d.id); setView('datos'); setMessage(`${d.samples.length} muestras guardadas en «${d.name}».`); return d; }
    async function removePilot() { if (!deletePilot) return; setDeleteError(''); setBusy(true); try { const r = await fetch('/api/pilots', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: deletePilot }) }); const d = await r.json() as { name: string; error?: string }; if (!r.ok) throw new Error(d.error); setRemoved(old => old.includes(d.name) ? old : [...old, d.name]); setPilot('Todos los pilotos'); setDeletePilot(null); setMessage(`Piloto «${d.name}» eliminado del listado. Sus datos históricos se conservan.`); } catch (e) { setDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar.'); } finally { setBusy(false); } }
    function openSavedSession(saved: Session) { setSessions(old => [...old.filter(s => s.id !== saved.id), saved]); setCar(saved.carId ?? 'unassigned'); setDay(saved.eventDate ?? day); setContext(saved.sessionContext ?? 'race-day'); const next = stages.find(s => s.category === saved.carCategory && s.type === saved.sessionType); if (next) setStageId(next.id); changeSession(saved.id); setView('datos'); }
    async function runAnalysis() { setBusy(true); setAnalysis(''); try { const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session?.id, pilot, carCategory: session?.carCategory, carId: session?.carId, sessionType: session?.sessionType, eventDate: session?.eventDate, sessionContext: session?.sessionContext }) }); const d = await r.json() as { error?: string; text: string }; if (!r.ok) throw new Error(d.error); setAnalysis(d.text); } catch (e) { setAnalysis(e instanceof Error ? e.message : 'No se pudo generar el análisis.'); } finally { setBusy(false); } }
    const nav = [{ id: 'inicio', label: 'Portada', icon: Flag }, { id: 'datos', label: 'Telemetría', icon: LayoutDashboard }, { id: 'carrera', label: 'Carrera', icon: Radio }, { id: 'simulador', label: 'Simulador', icon: Gamepad2 }, { id: 'circuitos', label: 'Circuitos', icon: MapPinned }, { id: 'database', label: 'Base de datos', icon: Database }, { id: 'coche', label: 'Coche · componentes', icon: Settings2 }, { id: 'entrada', label: 'Meter datos', icon: Upload }, { id: 'pilotos', label: 'Pilotos · IA', icon: Users }, { id: 'carreras', label: 'Carreras guardadas', icon: Flag }, { id: 'otros-equipos', label: 'Otros equipos', icon: Users }];
    return <div className="app-shell">
        <aside className="sidebar">
            <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('inicio'); }}>
                <span className="brand-icon"><Zap size={24} fill="currentColor" /></span>
                <span>MGRT<small>MAKERGUNEA<br />RACING TEAM</small></span>
            </a>
            <div className="nav-label">ESPACIO DE TRABAJO</div>
            <nav>
                {nav.map(n => <button key={n.id} aria-label={n.label} title={n.label} className={'nav-item ' + (view === n.id || (n.id === 'coche' && parts.some(p => p.id === view)) ? 'active' : '')} onClick={() => setView(n.id)}>
                    <n.icon size={19} />{n.label}{(view === n.id || (n.id === 'coche' && parts.some(p => p.id === view))) && <span className="nav-mark" />}
                </button>)}
                <a href="/demostracion" className="nav-item"><Flag size={19} />Demostración</a>
            </nav>
            <div className="sidebar-session">
                <span className="small-label">COCHE DEL EQUIPO</span>
                <div className="car-number">{car === 'unassigned' ? '—' : <>MG<span>{car === 'car-1' ? '01' : '02'}</span></>}</div>
                <p>{car === 'unassigned' ? 'Sesiones sin clasificar' : context === 'practice' ? 'Día de prácticas' : 'F24+ y F24 · ambos coches'}</p>
                <div className="session-type"><Radio size={14} />{view === 'circuitos' ? 'Circuitos · biblioteca local' : view === 'carrera' ? 'Carrera · simulación' : view === 'simulador' ? 'Simulador · conducción manual' : view === 'otros-equipos' ? 'Fuente externa · NS Service' : !session ? 'Sin sesión seleccionada' : session.demo ? 'Sesión de demostración' : 'Archivo importado'}</div>
            </div>
            <div className="sidebar-bottom">
                <button onClick={() => setModal('login')}>
                    <span className="avatar">{user ? user.name.slice(0, 2).toUpperCase() : 'MG'}</span>
                    <span className="account-name">{user ? user.name : 'Tu equipo'}<small>{user ? 'Cuenta conectada' : 'Acceso al espacio de trabajo'}</small></span>
                    <Settings2 size={17} />
                </button>
                <span className="version">MGRT TELEMETRÍA / V1.0</span>
            </div>
        </aside>

        <div className="main-shell">
            <header className="topbar">
                <div className="breadcrumb">Espacio de trabajo <ChevronRight size={14} /><span>{parts.find(p => p.id === view)?.name ?? nav.find(n => n.id === view)?.label}</span></div>
                <div className="top-actions">
                    <span className="mode-badge"><span />{view === 'circuitos' ? 'CIRCUITOS' : view === 'database' ? 'ARCHIVO MGRT' : view === 'otros-equipos' ? 'RESULTADOS EXTERNOS' : view === 'carrera' ? 'SIMULACIÓN' : view === 'simulador' ? 'CONDUCCIÓN' : !session ? 'SIN DATOS' : session.demo ? 'DATOS DE EJEMPLO' : 'DATOS IMPORTADOS'}</span>
                    <button className="account-button" onClick={() => setModal('login')}><LogIn size={16} />{user ? 'Mi cuenta' : 'Iniciar sesión'}</button>
                </div>
            </header>

            <main>
                <div className="page-heading"><div><div className="eyebrow">MAKERGUNEA RACING TEAM / MGRT</div><h1>{view === 'inicio' ? 'Portada' : view === 'carrera' ? 'Carrera' : view === 'simulador' ? 'Simulador' : view === 'circuitos' ? 'Circuitos' : view === 'database' ? 'Base de datos' : view === 'otros-equipos' ? 'Otros equipos' : view === 'carreras' ? 'Carreras guardadas' : view === 'entrada' ? 'Meter datos' : view === 'datos' ? 'Telemetría' : view === 'pilotos' ? 'Rendimiento de pilotos' : view === 'coche' ? 'Explora el coche' : parts.find(p => p.id === view)?.name ?? 'Resumen general'}</h1><p>{view === 'inicio' ? 'El espacio del equipo para consultar, importar y comparar la telemetría.' : view === 'carrera' ? 'Carrera en directo con panel original de telemetría, clasificación, vueltas y repetición.' : view === 'simulador' ? 'Dos jugadores en la misma pista: flechas o volante para J1, WASD para J2, con colisiones, curvas y pendientes.' : view === 'circuitos' ? 'Prepara el trazado de cada carrera desde un plano, un mapa o un archivo de Google Earth.' : view === 'database' ? 'Repeticiones, sesiones, vehículos y circuitos guardados, con comparación entre elementos del mismo tipo.' : view === 'otros-equipos' ? 'Busca equipos y consulta los resultados publicados de cada competición y prueba.' : view === 'carreras' ? 'Todas tus jornadas, con los datos originales de cada sesión.' : view === 'entrada' ? 'Sube un documento o introduce las muestras manualmente.' : view === 'datos' ? 'Una tabla general de la sesión. Abre el coche para explorar cada componente.' : view === 'pilotos' ? 'Compara el ritmo y la temperatura de cada relevo.' : 'Selecciona un componente para consultar sus datos.'}</p></div>{view !== 'entrada' && view !== 'carrera' && view !== 'simulador' && view !== 'otros-equipos' && view !== 'circuitos' && view !== 'database' && <button className="primary" onClick={openUpload}><Upload size={17} />Meter datos</button>}</div>
                {view !== 'inicio' && view !== 'entrada' && view !== 'carreras' && view !== 'carrera' && view !== 'simulador' && view !== 'database' && view !== 'otros-equipos' && view !== 'circuitos' && <><div className="context-options" role="group" aria-label="Tipo de jornada"><button className={context === 'race-day' ? 'selected' : ''} aria-pressed={context === 'race-day'} onClick={() => changeContext('race-day')}><Flag size={17} />Jornada de carrera</button><button className={context === 'practice' ? 'selected' : ''} aria-pressed={context === 'practice'} onClick={() => changeContext('practice')}><Activity size={17} />Días de prácticas</button></div>
                    <div className="fleet-bar"><div className="fleet-label"><Flag size={18} /><span>COCHES DEL EQUIPO</span></div><div className="fleet-options" role="group" aria-label="Seleccionar coche">{cars.map(c => <button key={c.id} aria-pressed={car === c.id} className={car === c.id ? 'fleet-car selected' : 'fleet-car'} onClick={() => changeCar(c.id)}><span>MGRT</span><strong>{c.name}</strong><small>Carreras y prácticas · {sessions.filter(s => s.carId === c.id && !s.demo).length} sesiones</small></button>)}{sessions.some(isUnclassified) && <button className={car === 'unassigned' ? 'fleet-car selected' : 'fleet-car'} aria-pressed={car === 'unassigned'} onClick={() => changeCar('unassigned')}><strong>Sin clasificar</strong><small>Sesiones anteriores</small></button>}</div></div>
                    <section className="race-day panel"><div className="day-heading"><div><h2>{context === 'practice' ? 'Día de prácticas' : 'Jornada de carrera'}</h2><p>{context === 'practice' ? 'Entrenamientos normales de cada coche, organizados por fecha.' : 'Los dos coches participan en cada entrenamiento y carrera.'}</p></div><label>Jornada<select aria-label="Seleccionar jornada" value={day} disabled={car === 'unassigned'} onChange={e => changeDay(e.target.value)}>{days.map(d => <option key={d} value={d}>{new Date(d + 'T12:00:00').toLocaleDateString('es-ES')}</option>)}</select></label></div>{context === 'race-day' ? <div className="race-stages" role="group" aria-label="Fases de la jornada">{stages.map((s, i) => <button key={s.id} disabled={car === 'unassigned'} aria-pressed={stage.id === s.id && car !== 'unassigned'} className={stage.id === s.id && car !== 'unassigned' ? 'race-stage selected' : 'race-stage'} onClick={() => changeStage(s.id)}><span className="stage-number">0{i + 1}</span><span><strong>{s.label}</strong><small>Coche 1 + Coche 2</small></span></button>)}</div> : <div className="practice-description"><Activity size={18} /><span>Entrenamiento libre · Coche 1 y Coche 2</span></div>}</section></>}
                {message && <div className="notice" role="status">{message}<button aria-label="Cerrar aviso" onClick={() => setMessage('')}><X size={16} /></button></div>}
                {view === 'inicio' ? <HomeOverview sessions={sessions} onNavigate={setView} /> : view === 'otros-equipos' ? <Suspense fallback={<p role="status" className="teams-loading">Cargando otros equipos…</p>}><OtherTeams /></Suspense> : view === 'circuitos' ? <Suspense fallback={<p role="status">Cargando editor de circuitos…</p>}><CircuitsEditor user={!!user} onRace={() => setView('carrera')} /></Suspense> : view === 'database' ? <Suspense fallback={<p role="status">Cargando la base de datos…</p>}><DatabaseArchive user={!!user} /></Suspense> : view === 'carrera' ? <RaceLive user={!!user} onManageCircuits={() => setView('circuitos')} /> : view === 'simulador' ? <Suspense fallback={<p role="status">Preparando el simulador…</p>}><Simulator user={!!user} onManageCircuits={() => setView('circuitos')} /></Suspense> : view === 'carreras' ? <RaceArchive user={!!user} onOpen={openSavedSession} /> : view === 'entrada' ? <DataEntry user={!!user} initial={{ carId: car === 'unassigned' ? 'car-1' : car, context, date: day, category: stage.category, type: stage.type }} onSave={saveSession} /> : <>
                    <div className="session-bar"><div className="select-field"><Flag size={17} /><label htmlFor="session">Sesión</label><select id="session" value={session?.id ?? ''} disabled={!session} onChange={e => changeSession(e.target.value)}>{!session && <option value="">Sin sesiones para esta selección</option>}{carSessions.map(s => <option key={s.id} value={s.id}>{s.name}{car === 'unassigned' && s.carCategory ? ` · ${s.carCategory}` : ''}</option>)}</select></div><div className="select-field"><Users size={17} /><select aria-label="Filtrar por piloto" value={pilot} onChange={e => setPilot(e.target.value)}><option>Todos los pilotos</option>{pilots.map(p => <option key={p}>{p}</option>)}</select></div><div className="session-meta"><Timer size={15} />{clock(metrics.duration)}<span className="divider" /><span>{rows.length} muestras</span>{loading && <span>Cargando…</span>}</div></div>
                    {!session ? <section className="panel empty-session"><FileSpreadsheet size={30} /><h2>Sin datos para esta sesión</h2><p>Importa el archivo de {cars.find(c => c.id === car)?.name ?? 'tu coche'} · {context === 'practice' ? 'entrenamiento de prácticas' : stage.label} para esta jornada.</p><button className="primary" onClick={openUpload}><Upload size={17} />Meter datos</button></section> : view === 'datos' ? <><div className="general-actions"><span>{session.name}</span><button className="secondary" onClick={() => setView('coche')}><Settings2 size={17} />Explorar componentes</button></div>
                        <section className="panel table-panel"><div className="panel-heading"><div><h2>Tabla general de telemetría</h2><p>{session?.demo ? 'Muestras de demostración' : 'Muestras del archivo importado'} · valores ausentes: —</p></div><span className="table-count">{rows.length} registros</span></div><div className="table-scroll"><table><thead><tr><th>TIEMPO</th><th>PILOTO</th><th>MOTOR <span>°C</span></th><th>BATERÍA <span>°C</span></th><th>MOTOR <span>rpm</span></th><th>RUEDA <span>rpm</span></th><th>GPS <span>km/h</span></th></tr></thead><tbody>{rows.slice(page * 8, page * 8 + 8).map((r, i) => <tr key={r.time} className={page * 8 + i === cursor ? 'selected-row' : ''} onClick={() => { setCursor(page * 8 + i); setPlaying(false); }}><td><button className="time-cell" aria-label={`Ver muestra de ${clock(r.time)}`} onClick={() => setCursor(page * 8 + i)}>{clock(r.time)}</button></td><td><span className="pilot-dot" />{r.pilot}</td><td>{fmt(r.motorTemp)}</td><td>{fmt(r.batteryTemp)}</td><td>{fmt(r.motorRpm, 0)}</td><td>{fmt(r.wheelRpm, 0)}</td><td className="speed-cell">{fmt(r.speed)}</td></tr>)}</tbody></table></div><div className="pagination"><span>{rows.length ? `Mostrando ${page * 8 + 1}–${Math.min(page * 8 + 8, rows.length)} de ${rows.length}` : 'Sin registros'}</span><div><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span>{page + 1} / {pages}</span><button disabled={(page + 1) * 8 >= rows.length} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></div></section></> : view === 'coche' ? <CarComponents carId={car} carName={cars.find(c => c.id === car)?.name ?? 'Coche de la sesión'} onSelect={p => setView(p)} /> : parts.some(p => p.id === view) ? <><PartDetails part={view as PartId} rows={rows} index={cursor} onBack={() => setView('coche')} />
                            <div className="playback panel"><button disabled={!rows.length} className="play-button" onClick={() => { if (cursor >= rows.length - 1) setCursor(0); setPlaying(!playing); }} aria-label={playing ? 'Pausar reproducción' : 'Reproducir sesión'}>{playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button><span className="play-label">Reproducción<span>{clock(current?.time ?? 0)} / {clock(rows[rows.length - 1]?.time ?? 0)}</span></span><input aria-label="Posición temporal de la sesión" type="range" min={0} max={Math.max(0, rows.length - 1)} value={cursor} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }} /><span className="play-rate">4 muestras/s</span></div>
                            {view === 'gps' && <section className="panel track-panel component-gps-map"><div className="panel-heading"><div><h2>Mapa del circuito</h2><p>{session.demo ? 'Recorrido simulado · no es un circuito real' : 'Recorrido del archivo GPS'}</p></div></div><TrackMap rows={rows} index={cursor} /><div className="map-footer"><span>{current?.pilot}</span><span>{fmt(metrics.distance, 2)} km registrados · media {fmt(metrics.mean)} km/h</span></div></section>}</> : <>
                            {!pilots.length && <div className="notice">No hay pilotos activos en esta sesión. Los registros históricos siguen disponibles en la tabla general.</div>}<div className="pilot-grid">{pilots.filter(p => pilot === 'Todos los pilotos' || pilot === p).map((p, i) => { const r = (session?.samples ?? []).filter(s => s.pilot === p), m = stats(r); return <article className="panel pilot-card" key={p}><div className="pilot-card-top"><span className="pilot-avatar">{p.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><div className="pilot-card-controls">{user && <button className="remove-row" aria-label={`Eliminar piloto ${p}`} onClick={() => { setDeleteError(''); setDeletePilot(p); }}><Trash2 size={16} /></button>}<span className="driver-number">P{String(i + 1).padStart(2, '0')}</span></div></div><h2>{p}</h2><p>{r.length} muestras · {clock(m.duration)} de datos</p><div className="driver-speed">{fmt(m.mean)} <span>km/h de media</span></div><dl><div><dt>Velocidad máxima</dt><dd>{fmt(m.maxSpeed)} km/h</dd></div><div><dt>Variación de velocidad</dt><dd>± {fmt(m.deviation)} km/h</dd></div><div><dt>Máxima del motor</dt><dd>{fmt(m.maxMotor)} °C</dd></div><div><dt>Máxima de batería</dt><dd>{fmt(m.maxBattery)} °C</dd></div></dl><button className="secondary full" onClick={() => { setPilot(p); setView('datos'); }}>Ver su telemetría <ChevronRight size={16} /></button></article>; })}</div><section className="panel ai-panel"><div className="ai-icon"><Zap size={24} /></div><div><div className="ai-heading"><h2>Análisis de pilotos con IA</h2><span className="pending">PENDIENTE DE CONEXIÓN</span></div><p>El servicio de IA todavía no está activado. Las métricas de arriba se calculan directamente a partir de las muestras; no son un informe de IA.</p><p>Al conectar el servicio, podrás solicitar un informe por piloto sobre ritmo, regularidad y evolución térmica.</p><button className="primary" disabled={busy} onClick={runAnalysis}><Zap size={16} />{busy ? 'Comprobando…' : 'Comprobar conexión de IA'}</button>{analysis && <div className="analysis-message" role="status">{analysis}</div>}</div></section></>}
                </>}


                <footer>
                    <span>MGRT <b>/</b> MAKERGUNEA RACING TEAM</span>
                    <span>{view === 'circuitos' ? 'Biblioteca local de circuitos · exporta para compartir' : view === 'otros-equipos' ? 'Resultados públicos · NS Service' : view === 'carrera' ? 'Simulación · sin conexión al coche' : !session ? 'Sin datos para esta selección' : session.demo ? 'Demostración · sin conexión al coche' : 'Sesión importada · reproducción de datos'}</span>
                </footer>
            </main>
        </div>

        <Dialog.Root open={modal === 'login'} onOpenChange={open => setModal(open ? 'login' : null)}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal-backdrop" />
                <Dialog.Content className="modal account-modal">
                    <Dialog.Close className="modal-close" aria-label="Cerrar acceso"><X size={20} /></Dialog.Close>
                    <div className="modal-icon"><LogIn size={25} /></div>
                    <Dialog.Title>{user ? 'Tu cuenta' : 'Iniciar sesión'}</Dialog.Title>
                    <Dialog.Description>{user ? 'Tu cuenta está conectada. Puedes guardar y recuperar las sesiones del equipo.' : 'Accede con tu cuenta para guardar sesiones, consultar carreras y gestionar pilotos.'}</Dialog.Description>
                    {user ? <><div className="account-details"><strong>{user.name}</strong><span>{user.email}</span></div><a className="secondary full" href="/signout-with-chatgpt?return_to=%2Facceso" target="_top">Cerrar sesión</a></> : <a className="primary full" href="/signin-with-chatgpt?return_to=%2F" target="_top"><LogIn size={17} />Iniciar sesión con ChatGPT</a>}
                    <div className="google-pending"><span className="google-g">G</span><div><strong>Google · pendiente de conexión</strong><p>El acceso disponible utiliza ChatGPT. El inicio de sesión directo con Google todavía no está configurado.</p></div></div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={!!deletePilot} onOpenChange={open => { if (!open && !busy) setDeletePilot(null); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal-backdrop" />
                <Dialog.Content className="modal account-modal">
                    <Dialog.Title>Eliminar piloto</Dialog.Title>
                    <Dialog.Description>¿Eliminar a {deletePilot} del listado activo? Sus mediciones históricas permanecerán en las sesiones guardadas.</Dialog.Description>
                    {deleteError && <div className="entry-error" role="alert">{deleteError}</div>}
                    <div className="delete-pilot-actions"><button className="secondary" disabled={busy} onClick={() => setDeletePilot(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={removePilot}>{busy ? 'Eliminando…' : 'Eliminar piloto'}</button></div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    </div>;

}
function Metric({ title, value, unit, icon, note, featured = false }: { title: string; value: string; unit: string; icon: ReactNode; note: string; featured?: boolean }) { return <article className={'metric ' + (featured ? 'featured' : '')}><div className="metric-label">{title}{icon}</div><div className="metric-value">{value}<span>{unit}</span></div><div className="metric-note">{featured ? <Activity size={13} /> : <span className="metric-dash" />}{note}</div></article>; }

function HomeOverview({ sessions, onNavigate }: { sessions: Session[]; onNavigate: (view: string) => void }) {
    const saved = sessions.filter(s => !s.demo);
    return <>
        <section className="welcome">
            <div className="welcome-content">
                <span className="small-label">MAKERGUNEA RACING TEAM</span>
                <h2>Conoce el coche.<br /><em>Entiende cada vuelta.</em></h2>
                <p>Consulta las sesiones de los dos coches, revisa sus componentes y compara a los pilotos en carreras y días de prácticas.</p>
                <div className="welcome-actions"><button className="primary" onClick={() => onNavigate('datos')}><Activity size={17} />Ver telemetría</button><button className="secondary" onClick={() => onNavigate('simulador')}><Gamepad2 size={17} />Conducir coche</button><button className="secondary" onClick={() => onNavigate('carrera')}><Radio size={17} />Simular carrera</button><button className="secondary" onClick={() => onNavigate('entrada')}><Upload size={17} />Meter datos</button></div>
            </div>
            <div className="welcome-stat"><strong>{cars.length}<small>coches</small></strong><span>F24+ · F24 · DÍAS DE PRÁCTICAS</span></div>
        </section>
        <div className="metrics-grid home-metrics">
            <Metric title="SESIONES IMPORTADAS" value={String(saved.length)} unit="" icon={<FileSpreadsheet size={18} />} note="Sesiones cargadas de tu cuenta" />
            <Metric title="JORNADAS IMPORTADAS" value={String(new Set(saved.map(s => s.eventDate).filter(Boolean)).size)} unit="" icon={<Flag size={18} />} note="Fechas de los datos importados" />
            <Metric title="PILOTOS CON DATOS" value={String(new Set(saved.flatMap(s => s.samples.map(r => r.pilot))).size)} unit="" icon={<Users size={18} />} note="Pilotos en sesiones importadas" />
            <Metric title="SESIONES DE EJEMPLO" value={String(sessions.filter(s => s.demo).length)} unit="" icon={<Gauge size={18} />} note="Datos de demostración disponibles" />
        </div>
        <div className="home-grid">
            <article className="panel home-card"><Settings2 size={28} /><h3>Coche y componentes</h3><p>Temperatura y revoluciones del motor, temperatura de las baterías, ruedas y recorrido GPS.</p><button onClick={() => onNavigate('coche')}>Explorar el coche <ChevronRight size={17} /></button></article>
            <article className="panel home-card"><Users size={28} /><h3>Pilotos</h3><p>Consulta las velocidades, la regularidad y las temperaturas de cada piloto en la sesión seleccionada.</p><button onClick={() => onNavigate('pilotos')}>Comparar pilotos <ChevronRight size={17} /></button></article>
            <article className="panel home-card"><Flag size={28} /><h3>Carreras guardadas</h3><p>Recupera tus jornadas de carrera y descarga los datos originales de cada sesión.</p><button onClick={() => onNavigate('carreras')}>Consultar carreras <ChevronRight size={17} /></button></article>
        </div>
    </>;
}
