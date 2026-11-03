export const TEAMS_SOURCE_URL = 'https://test.ns-service.es/competiciones.php';
export const TEAMS_SITE = 'https://test.ns-service.es';
export const TEAMS_API = 'https://test2.ns-service.es:6001';

export type Competition = { code: string; description: string; startDate: string };
export type PublicEvent = { id: string; name: string };
export type PublicUnit = { id: string; eventId: string; name: string; status: number | null };
export type Entry = { id: string; eventId: string; team: string; school: string; bib: string; category: string };
export type PublicResult = { entryId: string; eventId: string; unitId: string; rank: number | null; laps: number | null; time: number | null; bestLap: number | null; distance: number | null; speed: number | null; gap: string; incident: string };
export type CompetitionData = { code: string; events: PublicEvent[]; units: PublicUnit[]; entries: Entry[]; results: PublicResult[] };
export type TeamRow = Entry & { result: PublicResult | null };

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato inesperado en la fuente de resultados.');
    return value as Record<string, unknown>;
}
const text = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
function identifier(value: unknown) { const id = text(value); if (!id) throw new Error('Identificador ausente en la fuente.'); return id; }
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('La fuente no ha enviado un listado válido.'); return value; }
function numeric(value: unknown): number | null {
    if (value == null || (typeof value === 'string' && !value.trim()) || (typeof value !== 'number' && typeof value !== 'string')) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}
export function parseCompetitions(value: unknown): Competition[] {
    return list(value).map(item => {
        const row = record(item);
        const date = text(row.startDate);
        return { code: identifier(row.code), description: text(row.description) || 'Competición sin nombre', startDate: Number.isFinite(Date.parse(date)) ? date : '' };
    }).sort((a, b) => (Date.parse(b.startDate) || 0) - (Date.parse(a.startDate) || 0));
}
export function parseCompetitionData(value: unknown): CompetitionData {
    const data = record(typeof value === 'string' ? JSON.parse(value) : value);
    return {
        code: identifier(data.competitionCode),
        events: list(data.events).map(item => { const r = record(item); return { id: identifier(r.IDEvent), name: text(r.Description) }; }),
        units: list(data.eventUnits).map(item => { const r = record(item); return { id: identifier(r.IDEventUnit), eventId: identifier(r.IDEvent), name: text(r.Description), status: numeric(r.Status) }; }),
        entries: list(data.inscriptions).map(item => { const r = record(item); return { id: identifier(r.IDRegister), eventId: identifier(r.IDEvent), team: text(r.Team), school: text(r.RegName), bib: text(r.Bib), category: text(r.Class) }; }),
        results: list(data.results).map(item => {
            const r = record(item);
            return { entryId: identifier(r.IDRegister), eventId: identifier(r.IDEvent), unitId: identifier(r.IDEventUnit), rank: numeric(r.Rank), laps: numeric(r.Laps), time: numeric(r.Time), bestLap: numeric(r.BestLap), distance: numeric(r.Distance), speed: numeric(r.Speed), gap: text(r.Gap), incident: text(r.IRM) };
        }),
    };
}
export const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').trim();
export function teamRows(data: CompetitionData, unit: PublicUnit): TeamRow[] {
    const results = data.results.filter(r => r.eventId === unit.eventId && r.unitId === unit.id);
    const entries = data.entries.filter(e => e.eventId === unit.eventId);
    const rows: TeamRow[] = entries.map(entry => ({ ...entry, result: results.find(r => r.entryId === entry.id) ?? null }));
    // Preserve published results even when the source omits the registration.
    for (const result of results) if (!entries.some(e => e.id === result.entryId)) rows.push({ id: result.entryId, eventId: unit.eventId, team: 'Inscripción no disponible', school: '', bib: '', category: '', result });
    return rows;
}
export function filterTeamRows(rows: TeamRow[], query: string, category: string, order: string): TeamRow[] {
    const q = searchText(query);
    return rows.filter(r => (category === 'all' || r.category === category) && (!q || searchText(`${r.team} ${r.school} ${r.bib} ${r.category}`).includes(q))).sort((a, b) => {
        if (order === 'team') return a.team.localeCompare(b.team, 'es');
        if (order === 'speed' || order === 'distance') return (b.result?.[order] ?? -1) - (a.result?.[order] ?? -1);
        return ((a.result?.rank || Infinity) - (b.result?.rank || Infinity)) || a.bib.localeCompare(b.bib, 'es', { numeric: true });
    });
}
export function resultTime(milliseconds: number | null | undefined, precise = false): string {
    if (milliseconds == null) return '—';
    const total = Math.floor(milliseconds / 1000);
    const hh = String(Math.floor(total / 3600)).padStart(2, '0');
    const mm = String(Math.floor(total / 60) % 60).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}${precise ? '.' + String(Math.floor(milliseconds % 1000)).padStart(3, '0') : ''}`;
}
export const publicStatus = (status: number | null) => ({ 1: 'Lista de salida', 2: 'En progreso', 3: 'Finalizado', 4: 'Oficial', 5: 'En revisión' })[status ?? 0] ?? 'Estado no indicado';
