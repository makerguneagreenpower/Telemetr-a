import { createCircuitRuntime, geoToVertices, pointDistance, type GeoPoint } from './circuits';

/**
 * Terrain heights from the Open-Meteo Elevation API (Copernicus DEM GLO-90, ~90 m grid).
 * The coordinates of the sampled points are sent to api.open-meteo.com; nothing else is.
 */
const ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
const BATCH = 100;              // API limit per request
const MAX_SAMPLES = 400;        // at most 4 requests per circuit
const MIN_SPACING = 15;         // metres between sampled points; the DEM has no detail below this
const MAX_SAFE_GRADE = .2;      // DEM noise can create spikes; real circuits rarely exceed this
const SMOOTH_RADIUS = 100;      // metres; a little more than one DEM cell

/** `softened` is true when some slopes had to be reduced to fit the simulation's limits. */
export type TerrainResult = { points: GeoPoint[]; sampled: number; range: number; softened: boolean };

export async function fetchTerrainHeights(route: GeoPoint[], signal?: AbortSignal): Promise<TerrainResult> {
    if (route.length < 3) throw new Error('Traza al menos tres puntos sobre el mapa antes de pedir las alturas.');
    const vertices = geoToVertices(route), cumulative = [0];
    for (let i = 1; i < vertices.length; i++) cumulative.push(cumulative[i - 1] + pointDistance(vertices[i - 1], vertices[i]));
    const length = cumulative[cumulative.length - 1] + pointDistance(vertices[vertices.length - 1], vertices[0]);

    // Sample vertices spread along the lap: every vertex for sparse tracings, a subset for dense KML.
    const spacing = Math.max(MIN_SPACING, length / MAX_SAMPLES), chosen: number[] = [];
    for (let i = 0; i < route.length; i++) if (!chosen.length || cumulative[i] - cumulative[chosen[chosen.length - 1]] >= spacing) chosen.push(i);
    if (chosen.length > 1 && length - cumulative[chosen[chosen.length - 1]] < spacing / 2) chosen.pop();
    if (chosen.length < 2) throw new Error('El circuito es demasiado pequeño para el modelo de terreno (resolución de unos 90 m).');

    const heights: number[] = [];
    for (let start = 0; start < chosen.length; start += BATCH) {
        const slice = chosen.slice(start, start + BATCH);
        const url = `${ENDPOINT}?latitude=${slice.map(i => route[i].lat.toFixed(6)).join(',')}&longitude=${slice.map(i => route[i].lng.toFixed(6)).join(',')}`;
        let response: Response;
        try { response = await fetch(url, { signal, headers: { Accept: 'application/json' } }); }
        catch (error) { if (signal?.aborted) throw error; throw new Error('No se pudo conectar con el servicio de alturas. Comprueba la conexión a internet.'); }
        if (response.status === 429) throw new Error('El servicio de alturas ha recibido demasiadas peticiones. Prueba de nuevo en un minuto.');
        if (!response.ok) throw new Error(`El servicio de alturas ha respondido con un error (${response.status}).`);
        const data = await response.json() as { elevation?: unknown };
        if (!Array.isArray(data.elevation) || data.elevation.length !== slice.length || !data.elevation.every(v => typeof v === 'number' && Number.isFinite(v)))
            throw new Error('El servicio de alturas no devolvió datos válidos para este lugar.');
        heights.push(...data.elevation as number[]);
    }

    // Smooth along the closed lap with a triangular window measured in metres. The DEM is a ~90 m grid, so
    // neighbouring samples jump in steps between cells; averaging over ±SMOOTH_RADIUS removes those steps
    // while keeping hills that span more than a couple of cells.
    const n = heights.length, along = chosen.map(i => cumulative[i]);
    const radius = Math.min(SMOOTH_RADIUS, length / 4);
    const smooth = heights.map((_, i) => {
        let total = 0, weight = 0;
        for (let k = 0; k < n; k++) {
            const raw = Math.abs(along[k] - along[i]), distance = Math.min(raw, length - raw);
            if (distance >= radius) continue;
            const w = 1 - distance / radius; total += w * heights[k]; weight += w;
        }
        return total / weight;
    });

    // Relax any segment steeper than `limit` towards the pair's mean (keeps the overall climb, softens spikes).
    const gap = (a: number, b: number) => ((cumulative[chosen[b]] - cumulative[chosen[a]]) % length + length) % length || length;
    const relax = (input: number[], limit: number) => {
        const out = [...input];
        for (let pass = 0; pass < 200; pass++) {
            let changed = false;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n, allowed = gap(i, j) * limit, rise = out[j] - out[i];
                if (Math.abs(rise) > allowed + 1e-6) { const excess = (Math.abs(rise) - allowed) / 2 * Math.sign(rise); out[i] += excess; out[j] -= excess; changed = true; }
            }
            if (!changed) break;
        }
        return out;
    };
    // Only sampled vertices carry an altitude; the rest are interpolated smoothly by the circuit runtime.
    const build = (values: number[]) => {
        const byIndex = new Map(chosen.map((index, k) => [index, Math.round(values[k] * 10) / 10]));
        return route.map((p, i): GeoPoint => byIndex.has(i) ? { lat: p.lat, lng: p.lng, alt: byIndex.get(i)! } : { lat: p.lat, lng: p.lng });
    };
    // The smooth curve between samples can be a little steeper than the straight segments, so validate the
    // result exactly as the simulation will and tighten the limit until it is accepted.
    const steepest = Math.max(...smooth.map((y, i) => Math.abs(smooth[(i + 1) % n] - y) / gap(i, (i + 1) % n)));
    for (const limit of [MAX_SAFE_GRADE, .17, .14, .11, .08]) {
        const values = relax(smooth, limit), points = build(values);
        try {
            const vertices = geoToVertices(points);
            createCircuitRuntime({ version: 1, id: 'terrain-check', name: 'terrain', competition: '', width: 6, source: 'map', vertices, updatedAt: 'check' });
            return { points, sampled: n, range: Math.max(...values) - Math.min(...values), softened: steepest > limit };
        } catch { /* try a gentler limit */ }
    }
    throw new Error('El relieve de esta zona es demasiado empinado para la simulación (más del 25 % de pendiente).');
}
