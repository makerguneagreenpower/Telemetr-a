import { env } from 'cloudflare:workers';
import { createCircuitRuntime, validateCircuit } from '../../../lib/circuits';
import { getChatGPTUser } from '../../chatgpt-auth';

export async function GET() {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para consultar los circuitos del equipo.' }, { status: 401 });
    try {
        const result = await env.DB!.prepare('SELECT circuit_id as circuitId,name,competition,source,width,length,max_grade as maxGrade,elevation_range as elevationRange,updated_at as updatedAt FROM circuits WHERE owner = ? ORDER BY name COLLATE NOCASE')
            .bind(user.userId).all();
        return Response.json({ items: result.results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        return Response.json({ error: 'No se pudieron consultar los circuitos guardados.' }, { status: 503 });
    }
}

export async function POST(req: Request) {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para guardar circuitos en la base de datos.' }, { status: 401 });
    if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origen no permitido.' }, { status: 403 });
    if (Number(req.headers.get('content-length') ?? 0) > 5_000_000) return Response.json({ error: 'El circuito supera el tamaño permitido.' }, { status: 413 });

    let circuit: ReturnType<typeof validateCircuit>;
    try {
        const text = await req.text();
        if (text.length > 5_000_000) return Response.json({ error: 'El circuito supera el tamaño permitido.' }, { status: 413 });
        circuit = validateCircuit(JSON.parse(text));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'El circuito no es válido.' }, { status: 400 });
    }

    try {
        const runtime = createCircuitRuntime(circuit);
        const existing = await env.DB!.prepare('SELECT id,object_key as objectKey FROM circuits WHERE owner = ? AND circuit_id = ?')
            .bind(user.userId, circuit.id).first<{ id: string; objectKey: string }>();
        const id = existing?.id ?? crypto.randomUUID();
        const objectKey = `circuits/${user.userId}/${id}/${crypto.randomUUID()}.json`;
        await env.BUCKET!.put(objectKey, JSON.stringify(circuit), { httpMetadata: { contentType: 'application/json' } });
        try {
            await env.DB!.prepare('INSERT INTO circuits (id,owner,circuit_id,name,competition,source,width,length,max_grade,elevation_range,object_key,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,circuit_id) DO UPDATE SET name=excluded.name,competition=excluded.competition,source=excluded.source,width=excluded.width,length=excluded.length,max_grade=excluded.max_grade,elevation_range=excluded.elevation_range,object_key=excluded.object_key,updated_at=excluded.updated_at')
                .bind(id, user.userId, circuit.id, circuit.name, circuit.competition, circuit.source, circuit.width, runtime.length, runtime.elevation.maxGrade, runtime.elevation.range, objectKey, circuit.updatedAt).run();
        } catch (error) {
            await env.BUCKET!.delete(objectKey).catch(() => {});
            throw error;
        }
        if (existing) await env.BUCKET!.delete(existing.objectKey).catch(() => {});
        return Response.json({ circuitId: circuit.id, name: circuit.name, length: runtime.length, updatedAt: circuit.updatedAt }, { status: 201 });
    } catch {
        return Response.json({ error: 'No se pudo guardar el circuito en la base de datos. El archivo local no se ha sincronizado.' }, { status: 503 });
    }
}

export async function DELETE(req: Request) {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para eliminar circuitos de la base de datos.' }, { status: 401 });
    if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origen no permitido.' }, { status: 403 });
    const circuitId = new URL(req.url).searchParams.get('id');
    if (!circuitId || circuitId.length > 100) return Response.json({ error: 'Circuito no válido.' }, { status: 400 });
    try {
        const existing = await env.DB!.prepare('SELECT id,object_key as objectKey FROM circuits WHERE owner = ? AND circuit_id = ?')
            .bind(user.userId, circuitId).first<{ id: string; objectKey: string }>();
        if (!existing) return Response.json({ deleted: false });
        await env.DB!.prepare('DELETE FROM circuits WHERE owner = ? AND circuit_id = ?').bind(user.userId, circuitId).run();
        await env.BUCKET!.delete(existing.objectKey);
        return Response.json({ deleted: true });
    } catch {
        return Response.json({ error: 'No se pudo eliminar el circuito de la base de datos.' }, { status: 503 });
    }
}
