import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: 'Inicia sesión para consultar esta repetición.' }, { status: 401 });
    const { id } = await params;
    try {
        const row = await env.DB!.prepare('SELECT id,object_key as objectKey FROM race_replays WHERE id = ? AND owner = ?').bind(id, user.userId).first<{ id: string; objectKey: string }>();
        if (!row) return Response.json({ error: 'Repetición no encontrada.' }, { status: 404 });
        const object = await env.BUCKET!.get(row.objectKey);
        if (!object) return Response.json({ error: 'El archivo de repetición ya no está disponible.' }, { status: 404 });
        return Response.json({ id: row.id, ...(JSON.parse(await object.text()) as Record<string, unknown>) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        return Response.json({ error: 'No se pudo abrir la repetición.' }, { status: 503 });
    }
}
