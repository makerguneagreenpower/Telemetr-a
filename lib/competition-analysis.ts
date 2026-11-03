import { teamRows, type CompetitionData, type TeamRow } from './other-teams';

export type PaceCandidate = { id: string; name: string; bib: string; paceKmh: number; laps: number | null; partial: boolean };
export type PaceGroup = {
    eventId: string; unitId: string; name: string; category: string;
    registrations: number; comparable: number; status: number | null;
    leaders: PaceCandidate[];
    fastestLap: { name: string; bib: string; milliseconds: number } | null;
    advantagePercent: number | null;
};
export type CompetitionSummary = { groups: PaceGroup[]; consumptionAvailable: false; method: string; limitations: string[] };

function eligible(row: TeamRow) { return row.result && !/^(DNS|DSQ|DQ|EXC)$/i.test(row.result.incident.trim()); }

export function analyzeCompetition(data: CompetitionData): CompetitionSummary {
    const groups = data.units.flatMap(unit => {
        const event = data.events.find(e => e.id === unit.eventId);
        const rows = teamRows(data, unit);
        // Open/mixed practice sessions must not turn unlike categories into a single ranking.
        const mixed = !/^F24\+?$/i.test(event?.name.trim() ?? '');
        const categories = mixed ? [...new Set(rows.map(r => r.category || 'Sin categoría'))] : [''];
        return categories.map(category => {
            const group = category ? rows.filter(r => (r.category || 'Sin categoría') === category) : rows;
            const candidates = group.flatMap(row => {
                const result = row.result;
                if (!eligible(row) || !result || !result.time || !result.distance) return [];
                const paceKmh = result.distance * 3600000 / result.time;
                if (!Number.isFinite(paceKmh) || paceKmh <= 0) return [];
                return [{ id: row.id, name: row.team || row.school || `Dorsal ${row.bib}`, bib: row.bib, paceKmh, laps: result.laps, partial: !!result.incident }];
            }).sort((a, b) => b.paceKmh - a.paceKmh || a.id.localeCompare(b.id));
            const best = candidates[0];
            const leaders = best ? candidates.filter(c => c.paceKmh.toFixed(2) === best.paceKmh.toFixed(2)) : [];
            const second = candidates.find(c => best && c.paceKmh.toFixed(2) !== best.paceKmh.toFixed(2));
            const bestLaps = group.filter(eligible).filter(row => (row.result?.bestLap ?? 0) > 0).sort((a, b) => a.result!.bestLap! - b.result!.bestLap!);
            const lap = bestLaps[0];
            return {
                eventId: unit.eventId, unitId: unit.id,
                name: `${event?.name || 'Prueba'} · ${unit.name}`, category,
                registrations: group.length, comparable: candidates.length, status: unit.status,
                leaders, fastestLap: lap ? { name: lap.team || lap.school, bib: lap.bib, milliseconds: lap.result!.bestLap! } : null,
                advantagePercent: best && second && leaders.length === 1 ? (best.paceKmh / second.paceKmh - 1) * 100 : null,
            };
        });
    });
    return {
        groups, consumptionAvailable: false,
        method: 'Ritmo medio observado = distancia publicada (km) / tiempo publicado (horas). Se compara dentro de la misma prueba; las pruebas mixtas se separan por categoría. Las búsquedas y la paginación no recortan el análisis.',
        limitations: [
            'La fuente no publica consumo en Wh. No se puede identificar quién consume más ni calcular eficiencia en Wh/km. Más velocidad o distancia no demuestra mayor consumo.',
            'La media incluye el tiempo contabilizado por la fuente, incluidas posibles paradas. No demuestra por sí sola la regularidad ni predice el resultado final.',
            'Sin distancia y tiempo válidos no se asigna un líder de ritmo. Los resultados DNS, DSQ, DQ y EXC se excluyen; otras incidencias se señalan como datos parciales.',
        ],
    };
}
