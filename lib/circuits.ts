import { TRACK_OUTLINE, type TrackPoint } from './race-track';

export type CircuitPoint = { x: number; z: number };
export type GeoPoint = { lat: number; lng: number };
export type CircuitDefinition = {
    version: 1; id: string; name: string; competition: string; width: number;
    source: 'image' | 'map' | 'kml' | 'geojson' | 'demo';
    vertices: CircuitPoint[]; geographic?: GeoPoint[];
    referenceImage?: { dataUrl: string; width: number; height: number };
    imageDrawing?: { points: CircuitPoint[]; calibration: [CircuitPoint, CircuitPoint]; metres: number };
    updatedAt: string;
};
export type CircuitRuntime = {
    id: string; name: string; competition: string; width: number; length: number;
    source: CircuitDefinition['source']; revision: string; samples: number;
    point: (progress: number) => TrackPoint; outline: TrackPoint[]; viewBox: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number; span: number };
};
export const MAX_CIRCUIT_POINTS = 5000;
const R = 6371008.8;
const radians = Math.PI / 180;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const pointDistance = (a: CircuitPoint, b: CircuitPoint) => Math.hypot(a.x - b.x, a.z - b.z);

export function cleanVertices(points: CircuitPoint[]) {
    if (!Array.isArray(points) || points.length > MAX_CIRCUIT_POINTS) throw new Error('El trazado admite hasta 5000 puntos.');
    const clean: CircuitPoint[] = [];
    for (const point of points) {
        if (!point || !finite(point.x) || !finite(point.z)) throw new Error('El trazado contiene coordenadas no válidas.');
        if (!clean.length || pointDistance(clean[clean.length - 1], point) > .001) clean.push({ x: point.x, z: point.z });
    }
    if (clean.length > 1 && pointDistance(clean[0], clean[clean.length - 1]) < .001) clean.pop();
    if (clean.length < 3) throw new Error('Marca al menos tres puntos diferentes para formar el circuito.');
    const a=clean[0], b=clean[1];
    if(!clean.some(p=>Math.abs((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x))>1e-5)) throw new Error('Los puntos forman una línea recta. Traza también las curvas para cerrar el circuito.');
    return clean;
}

export function geoToVertices(points: GeoPoint[]): CircuitPoint[] {
    if (points.length < 3 || points.length > MAX_CIRCUIT_POINTS) throw new Error('El recorrido debe tener entre 3 y 5000 puntos.');
    for (const p of points) if (!p || !finite(p.lat) || !finite(p.lng) || Math.abs(p.lat) > 85 || Math.abs(p.lng) > 180) throw new Error('Las coordenadas geográficas no son válidas.');
    const unique = points.length > 1 && points[0].lat === points[points.length-1].lat && points[0].lng === points[points.length-1].lng ? points.slice(0,-1) : points;
    const origin = { lat: unique.reduce((sum,p) => sum + p.lat, 0) / unique.length, lng: points[0].lng }, cos = Math.cos(origin.lat * radians);
    return points.map(p => {
        let delta = p.lng - origin.lng;
        if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
        return { x: R * radians * delta * cos, z: -R * radians * (p.lat - origin.lat) };
    });
}

export function imageToVertices(points: CircuitPoint[], calibration: CircuitPoint[], metres: number) {
    if (calibration.length !== 2 || !finite(metres) || metres <= 0 || metres > 50000) throw new Error('Calibra la imagen con dos puntos y su distancia real en metros.');
    const pixels = pointDistance(calibration[0], calibration[1]);
    if (pixels < 2) throw new Error('Los dos puntos de calibración están demasiado juntos.');
    return points.map(p => ({ x: p.x * metres / pixels, z: p.z * metres / pixels }));
}

export function createCircuitRuntime(definition: CircuitDefinition): CircuitRuntime {
    if (!finite(definition.width) || definition.width < 3 || definition.width > 20) throw new Error('El ancho de pista debe estar entre 3 y 20 metros.');
    const original = cleanVertices(definition.vertices);
    const xs = original.map(p => p.x), zs = original.map(p => p.z);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2, centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    const vertices = original.map(p => ({ x: p.x - centerX, z: p.z - centerZ }));
    const loop = [...vertices, vertices[0]], cumulative = [0];
    for (let i = 1; i < loop.length; i++) cumulative.push(cumulative[i - 1] + pointDistance(loop[i - 1], loop[i]));
    const length = cumulative[cumulative.length - 1];
    if (length < 50 || length > 50000) throw new Error('La longitud del circuito debe estar entre 50 m y 50 km. Comprueba la escala y el cierre del trazado.');
    const at = (progress: number): CircuitPoint => {
        const distance = ((progress % 1 + 1) % 1) * length;
        let low = 0, high = cumulative.length - 1;
        while (high - low > 1) { const mid = (low + high) >> 1; if (cumulative[mid] <= distance) low = mid; else high = mid; }
        const ratio = (distance - cumulative[low]) / (cumulative[high] - cumulative[low]);
        return { x: loop[low].x + (loop[high].x - loop[low].x) * ratio, z: loop[low].z + (loop[high].z - loop[low].z) * ratio };
    };
    const point = (progress: number): TrackPoint => {
        const position = at(progress), previous = at(progress - 1 / length), next = at(progress + 1 / length);
        return { ...position, heading: Math.atan2(next.x - previous.x, next.z - previous.z) };
    };
    const samples = Math.min(4096, Math.max(720, Math.ceil(length / 2)));
    const outline = Array.from({ length: Math.min(samples, 1200) + 1 }, (_, index) => point(index / Math.min(samples, 1200)));
    const minX = Math.min(...vertices.map(p => p.x)), maxX = Math.max(...vertices.map(p => p.x)), minZ = Math.min(...vertices.map(p => p.z)), maxZ = Math.max(...vertices.map(p => p.z));
    const span = Math.max(maxX - minX, maxZ - minZ), padding = Math.max(20, definition.width * 2, span * .08);
    return { id: definition.id, name: definition.name, competition: definition.competition, source: definition.source, revision: definition.updatedAt, width: definition.width, length, samples, point, outline, bounds: { minX, maxX, minZ, maxZ, span }, viewBox: `${minX - padding} ${minZ - padding} ${maxX - minX + padding * 2} ${maxZ - minZ + padding * 2}` };
}

export const DEMO_CIRCUIT: CircuitDefinition = { version: 1, id: 'demo', name: 'Circuito de demostración', competition: '', width: 8.2, source: 'demo', vertices: TRACK_OUTLINE.slice(0, -1).map(p => ({ x: p.x, z: p.z })), updatedAt: 'demo-v1' };
export const DEMO_TRACK = createCircuitRuntime(DEMO_CIRCUIT);

export function validateCircuit(value: unknown): CircuitDefinition {
    if (!value || typeof value !== 'object') throw new Error('Archivo de circuito no válido.');
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100 || typeof data.competition !== 'string' || data.competition.length > 150 || !finite(data.width) || !['image', 'map', 'kml', 'geojson'].includes(String(data.source))) throw new Error('Los datos del circuito no tienen el formato esperado.');
    if (!Array.isArray(data.vertices)) throw new Error('Falta el trazado del circuito.');
    const circuit: CircuitDefinition = { version: 1, id: typeof data.id === 'string' && /^[\w-]{1,80}$/.test(data.id) && data.id !== 'demo' ? data.id : crypto.randomUUID(), name: data.name.trim(), competition: data.competition.trim(), width: data.width, source: data.source as CircuitDefinition['source'], vertices: cleanVertices(data.vertices), updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString() };
    if (data.geographic !== undefined) {
        if (!Array.isArray(data.geographic)) throw new Error('Coordenadas geográficas no válidas.');
        circuit.geographic = (data.geographic as GeoPoint[]).map(p => ({ lat: p.lat, lng: p.lng }));
        geoToVertices(circuit.geographic);
        // Use the coordinates as the authority when both representations are supplied.
        circuit.vertices = cleanVertices(geoToVertices(circuit.geographic));
    }
    if (data.referenceImage !== undefined) {
        const image = data.referenceImage as Record<string, unknown>;
        if (!image || typeof image.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image.dataUrl) || image.dataUrl.length > 9_000_000 || !finite(image.width) || !finite(image.height) || image.width < 1 || image.height < 1 || image.width > 20000 || image.height > 20000) throw new Error('La imagen de referencia no es válida o es demasiado grande.');
        circuit.referenceImage = { dataUrl: image.dataUrl, width: image.width, height: image.height };
    }
    if (data.imageDrawing !== undefined) {
        const drawing = data.imageDrawing as CircuitDefinition['imageDrawing'];
        if (!drawing || !Array.isArray(drawing.points) || !Array.isArray(drawing.calibration) || drawing.calibration.length !== 2) throw new Error('La calibración de la imagen no es válida.');
        const points = cleanVertices(drawing.points);
        for (const p of drawing.calibration) if (!finite(p.x) || !finite(p.z)) throw new Error('Calibración de imagen no válida.');
        imageToVertices(points, drawing.calibration, drawing.metres);
        circuit.imageDrawing = { points, calibration: drawing.calibration, metres: drawing.metres };
        if (circuit.source === 'image') circuit.vertices = cleanVertices(imageToVertices(points, drawing.calibration, drawing.metres));
    }
    if (circuit.source === 'image' && (!circuit.referenceImage || !circuit.imageDrawing)) throw new Error('El circuito de imagen necesita el plano original y una calibración A–B.');
    createCircuitRuntime(circuit);
    return circuit;
}

export type GeographicRoute = { name: string; points: GeoPoint[]; source: 'kml' | 'geojson' };
export function parseGeographicRoutes(text: string, format: 'kml' | 'geojson'): GeographicRoute[] {
    if (text.length > 6_000_000) throw new Error('El archivo de recorrido supera el límite de 6 MB.');
    const routes: GeographicRoute[] = [];
    const add = (name: string, coordinates: unknown) => {
        if (!Array.isArray(coordinates) || coordinates.length < 3) return;
        if (routes.length >= 100) throw new Error('El archivo contiene más de 100 recorridos. Exporta solo la capa del circuito.');
        const points = coordinates.map(c => { if (!Array.isArray(c) || !finite(c[0]) || !finite(c[1])) throw new Error('Hay coordenadas no válidas en el recorrido.'); return { lng: c[0], lat: c[1] }; });
        geoToVertices(points); routes.push({ name: name.slice(0,100) || `Recorrido ${routes.length + 1}`, points, source: format });
    };
    if (format === 'kml') {
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('El KML contiene elementos XML no admitidos.');
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('No se pudo leer el KML. Exporta el recorrido como archivo .kml sin comprimir.');
        const placemarks = Array.from(doc.getElementsByTagNameNS('*','Placemark'));
        for (const placemark of placemarks) {
            const name = placemark.getElementsByTagNameNS('*','name')[0]?.textContent ?? 'Recorrido';
            const geometries = [...Array.from(placemark.getElementsByTagNameNS('*','LineString')), ...Array.from(placemark.getElementsByTagNameNS('*','LinearRing'))];
            for (const geometry of geometries) {
                const coordinates = geometry.getElementsByTagNameNS('*','coordinates')[0]?.textContent?.trim();
                if (coordinates) add(name, coordinates.split(/\s+/).map(row => row.split(',').map(Number)));
            }
        }
    } else {
        const json: unknown = JSON.parse(text);
        const visit = (input: unknown, name = '') => {
            if (!input || typeof input !== 'object') return;
            const object = input as Record<string, unknown>;
            if (object.type === 'FeatureCollection' && Array.isArray(object.features)) { for (const feature of object.features) visit(feature); }
            else if (object.type === 'Feature') { const properties = object.properties as Record<string, unknown> | null; visit(object.geometry, typeof properties?.name === 'string' ? properties.name : name); }
            else if (object.type === 'LineString') add(name, object.coordinates);
            else if (object.type === 'MultiLineString' && Array.isArray(object.coordinates)) object.coordinates.forEach((line, i) => add(`${name || 'Recorrido'} ${i+1}`, line));
            else if (object.type === 'Polygon' && Array.isArray(object.coordinates)) add(name, object.coordinates[0]);
        };
        visit(json);
    }
    if (!routes.length) throw new Error('No hay recorridos de línea o perímetro en el archivo. Los marcadores de lugares no definen un circuito.');
    return routes;
}

export function circuitKml(circuit: CircuitDefinition) {
    if (!circuit.geographic?.length) throw new Error('Este circuito no tiene coordenadas geográficas. Exporta el JSON para conservar la imagen y la escala.');
    const escape = (text: string) => text.replace(/[<>&"']/g, character => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[character]!);
    const points = [...circuit.geographic, circuit.geographic[0]].map(p => `${p.lng},${p.lat},0`).join(' ');
    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${escape(circuit.name)}</name><LineString><tessellate>1</tessellate><coordinates>${points}</coordinates></LineString></Placemark></Document></kml>`;
}
