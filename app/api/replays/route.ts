import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { validateReplayDocument } from '../../../lib/race-replay';

export async function GET(req: Request) {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para consultar la base de datos de carreras.' }, { status: 401 });
    const offset = Number(new URL(req.url).searchParams.get('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return Response.json({ error: 'Página inválida.' }, { status: 400 });
    try {
        const result = await env.DB!.prepare('SELECT id,event_name as eventName,run_name as runName,circuit_id as circuitId,circuit_name as circuitName,track_length as trackLength,event_date as eventDate,created_at as createdAt,best_lap_seconds as bestLapSeconds,mg_wh as mgWh,total_time_seconds as totalTimeSeconds,lap_count as lapCount,telemetry_session_id as telemetrySessionId FROM race_replays WHERE owner = ? ORDER BY created_at DESC LIMIT 51 OFFSET ?')
            .bind(user.userId, offset).all();
        return Response.json({ items: result.results.slice(0, 50), nextOffset: result.results.length > 50 ? offset + 50 : null }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        return Response.json({ error: 'No se pudieron consultar las repeticiones guardadas.' }, { status: 503 });
    }
}

export async function POST(req: Request) {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para guardar una repetición.' }, { status: 401 });
    if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origen no permitido.' }, { status: 403 });
    if (Number(req.headers.get('content-length') ?? 0) > 5_000_000) return Response.json({ error: 'La repetición supera el tamaño permitido.' }, { status: 413 });

    let replay: ReturnType<typeof validateReplayDocument>;
    try {
        const text = await req.text();
        if (text.length > 5_000_000) return Response.json({ error: 'La repetición supera el tamaño permitido.' }, { status: 413 });
        replay = validateReplayDocument(JSON.parse(text));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'La repetición no es válida.' }, { status: 400 });
    }

    if (replay.telemetrySessionId) {
        try {
            const session = await env.DB!.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ?')
                .bind(replay.telemetrySessionId, user.userId).first();
            if (!session) return Response.json({ error: 'La sesión de telemetría asociada no existe en tu cuenta.' }, { status: 400 });
        } catch {
            return Response.json({ error: 'No se pudo verificar la sesión de telemetría asociada.' }, { status: 503 });
        }
    }

    const id = crypto.randomUUID(), createdAt = new Date().toISOString(), objectKey = `replays/${user.userId}/${id}.json`;
    try {
        await env.BUCKET!.put(objectKey, JSON.stringify(replay), { httpMetadata: { contentType: 'application/json' } });
        await env.DB!.prepare('INSERT INTO race_replays (id,owner,event_name,run_name,circuit_id,circuit_name,track_length,event_date,created_at,object_key,best_lap_seconds,mg_wh,total_time_seconds,lap_count,telemetry_session_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(id, user.userId, replay.eventName, replay.runName, replay.circuit.id, replay.circuit.name, replay.trackLength, replay.eventDate, createdAt, objectKey, replay.bestLapSeconds, replay.mgWh, replay.totalTimeSeconds, replay.lapCount, replay.telemetrySessionId).run();
        return Response.json({
            id, eventName: replay.eventName, runName: replay.runName, circuitId: replay.circuit.id,
            circuitName: replay.circuit.name, trackLength: replay.trackLength, eventDate: replay.eventDate,
            createdAt, bestLapSeconds: replay.bestLapSeconds, mgWh: replay.mgWh,
            totalTimeSeconds: replay.totalTimeSeconds, lapCount: replay.lapCount,
            telemetrySessionId: replay.telemetrySessionId,
        }, { status: 201 });
    } catch {
        await env.BUCKET?.delete(objectKey).catch(() => {});
        return Response.json({ error: 'No se pudo guardar la repetición. Vuelve a intentarlo.' }, { status: 503 });
    }
}
