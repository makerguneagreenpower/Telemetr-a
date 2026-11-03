import { parseCompetitions, TEAMS_API } from '../../../../lib/other-teams';

export async function GET() {
    try {
        const response = await fetch(`${TEAMS_API}/api/competitions`, { signal: AbortSignal.timeout(12000), cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('La fuente no responde.');
        const competitions = parseCompetitions(await response.json());
        return Response.json({ competitions, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return Response.json({ error: 'No se han podido consultar las competiciones de NS Service. Vuelve a intentarlo o abre la fuente original.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
}
