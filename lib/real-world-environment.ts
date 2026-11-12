import { geoToVertices, type GeoPoint } from './circuits';

const ELEVATION_ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const GRID_SIZE = 17;
const ELEVATION_BATCH = 100;
const MARGIN_METRES = 120;
const MAX_BUILDINGS = 1500;
const MAX_SURFACES = 1000;
const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export type EnvironmentPoint = { x: number; z: number };
export type EnvironmentSurface = { points: EnvironmentPoint[]; kind: string };
export type EnvironmentBuilding = { points: EnvironmentPoint[]; height: number };
export type RealWorldEnvironment = {
    terrain: { columns: number; rows: number; points: (EnvironmentPoint & { elevation: number })[] };
    surfaces: EnvironmentSurface[];
    buildings: EnvironmentBuilding[];
};

type OverpassElement = {
    id?: number;
    type?: string;
    tags?: Record<string, string>;
    geometry?: { lat: number; lon: number }[];
};

function localProjector(route: GeoPoint[]) {
    const origin = { lat: route.reduce((sum, point) => sum + point.lat, 0) / route.length, lng: route[0].lng };
    const vertices = geoToVertices(route);
    const centerX = (Math.min(...vertices.map(point => point.x)) + Math.max(...vertices.map(point => point.x))) / 2;
    const centerZ = (Math.min(...vertices.map(point => point.z)) + Math.max(...vertices.map(point => point.z))) / 2;
    return (point: GeoPoint): EnvironmentPoint => {
        let deltaLng = point.lng - origin.lng;
        if (deltaLng > 180) deltaLng -= 360;
        if (deltaLng < -180) deltaLng += 360;
        return {
            x: EARTH_RADIUS * RAD * deltaLng * Math.cos(origin.lat * RAD) - centerX,
            z: -EARTH_RADIUS * RAD * (point.lat - origin.lat) - centerZ,
        };
    };
}

function heightFromTags(tags: Record<string, string>) {
    const metres = Number.parseFloat(tags.height ?? '');
    if (Number.isFinite(metres) && metres > 0) return Math.max(3, Math.min(100, metres));
    const levels = Number.parseFloat(tags['building:levels'] ?? '');
    return Number.isFinite(levels) && levels > 0 ? Math.max(3, Math.min(100, levels * 3)) : 8;
}

function surfaceKind(tags: Record<string, string>) {
    const landuse = tags.landuse, natural = tags.natural, leisure = tags.leisure;
    if (natural === 'water' || tags.waterway === 'riverbank') return 'water';
    if (landuse === 'forest' || natural === 'wood') return 'forest';
    if (landuse === 'grass' || natural === 'grassland' || leisure === 'park' || leisure === 'garden') return 'grass';
    if (landuse === 'farmland' || landuse === 'meadow' || landuse === 'orchard' || landuse === 'vineyard') return 'field';
    if (landuse === 'industrial' || landuse === 'commercial') return 'industrial';
    if (landuse === 'residential' || landuse === 'retail') return 'residential';
    if (natural === 'scrub' || natural === 'heath') return 'scrub';
    if (leisure === 'pitch' || leisure === 'golf_course') return 'sport';
    return null;
}

export async function fetchRealWorldEnvironment(route: GeoPoint[], signal?: AbortSignal): Promise<RealWorldEnvironment> {
    if (route.length < 3) throw new Error('El circuito necesita al menos tres coordenadas geográficas para cargar el entorno real.');
    const vertices = geoToVertices(route);
    const spanX = Math.max(...vertices.map(point => point.x)) - Math.min(...vertices.map(point => point.x));
    const spanZ = Math.max(...vertices.map(point => point.z)) - Math.min(...vertices.map(point => point.z));
    const midLat = route.reduce((sum, point) => sum + point.lat, 0) / route.length;
    const latMargin = MARGIN_METRES / 111_320;
    const lngMargin = MARGIN_METRES / (111_320 * Math.max(.01, Math.cos(midLat * RAD)));
    const south = Math.min(...route.map(point => point.lat)) - latMargin;
    const north = Math.max(...route.map(point => point.lat)) + latMargin;
    const west = Math.min(...route.map(point => point.lng)) - lngMargin;
    const east = Math.max(...route.map(point => point.lng)) + lngMargin;
    const project = localProjector(route);
    const grid: GeoPoint[] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        const lat = south + (north - south) * row / (GRID_SIZE - 1);
        for (let column = 0; column < GRID_SIZE; column++) {
            grid.push({ lat, lng: west + (east - west) * column / (GRID_SIZE - 1) });
        }
    }

    const fetchElevation = async () => {
        const elevations: number[] = [];
        for (let start = 0; start < grid.length; start += ELEVATION_BATCH) {
            const batch = grid.slice(start, start + ELEVATION_BATCH);
            const url = new URL(ELEVATION_ENDPOINT);
            url.searchParams.set('latitude', batch.map(point => point.lat.toFixed(6)).join(','));
            url.searchParams.set('longitude', batch.map(point => point.lng.toFixed(6)).join(','));
            let response: Response;
            try {
                response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
            } catch (error) {
                if (signal?.aborted) throw error;
                throw new Error('No se pudo conectar con el servicio de elevación de Open-Meteo.');
            }
            if (response.status === 429) throw new Error('Open-Meteo ha limitado las consultas. Inténtalo de nuevo más tarde.');
            if (!response.ok) throw new Error(`Open-Meteo ha respondido con un error (${response.status}).`);
            const data = await response.json() as { elevation?: unknown };
            if (!Array.isArray(data.elevation) || data.elevation.length !== batch.length || !data.elevation.every(value => typeof value === 'number' && Number.isFinite(value))) {
                throw new Error('Open-Meteo no devolvió alturas válidas para el terreno.');
            }
            elevations.push(...data.elevation as number[]);
        }
        return grid.map((point, index) => ({ ...project(point), elevation: elevations[index] }));
    };

    const fetchFeatures = async () => {
        const bbox = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
        const query = `[out:json][timeout:25];(way["building"](${bbox});way["landuse"](${bbox});way["natural"](${bbox});way["leisure"](${bbox});way["waterway"="riverbank"](${bbox}););out geom;`;
        const url = new URL(OVERPASS_ENDPOINT);
        url.searchParams.set('data', query);
        let response: Response;
        try {
            response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new Error('No se pudieron consultar los edificios y usos del suelo de OpenStreetMap.');
        }
        if (response.status === 429) throw new Error('OpenStreetMap ha limitado las consultas. Inténtalo de nuevo más tarde.');
        if (!response.ok) throw new Error(`OpenStreetMap ha respondido con un error (${response.status}).`);
        const data = await response.json() as { elements?: unknown };
        if (!Array.isArray(data.elements)) throw new Error('OpenStreetMap no devolvió datos de edificios y superficies válidos.');
        const seen = new Set<number>();
        const buildings: EnvironmentBuilding[] = [], surfaces: EnvironmentSurface[] = [];
        for (const element of data.elements as OverpassElement[]) {
            if (element.type !== 'way' || !element.tags || !Array.isArray(element.geometry) || (element.id !== undefined && seen.has(element.id))) continue;
            const points = element.geometry
                .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
                .map(point => project({ lat: point.lat, lng: point.lon }));
            if (points.length < 3) continue;
            if (element.tags.building) {
                if (buildings.length < MAX_BUILDINGS) buildings.push({ points, height: heightFromTags(element.tags) });
            } else {
                const kind = surfaceKind(element.tags);
                if (kind && surfaces.length < MAX_SURFACES) surfaces.push({ points, kind });
            }
            if (element.id !== undefined) seen.add(element.id);
        }
        return { buildings, surfaces };
    };

    if (Math.max(spanX, spanZ) > 4000) {
        throw new Error('El entorno 3D real admite circuitos de hasta 4 km por lado. Reduce el trazado para consultar el relieve y los edificios.');
    }
    const [terrain, features] = await Promise.all([fetchElevation(), fetchFeatures()]);
    return { terrain: { columns: GRID_SIZE, rows: GRID_SIZE, points: terrain }, ...features };
}
