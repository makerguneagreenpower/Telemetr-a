import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { competitionAnalysisInput, generateCompetitionAI } from '../../../../lib/competition-ai';

const configuration = () => ({ key: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY, model: env.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini' });
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET() {
    const user = await getChatGPTUser();
    return reply({ configured: !!configuration().key, signedIn: !!user });
}

export async function POST(request: Request) {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Origen no permitido.' }, 403);
    const { key, model } = configuration();
    if (!key) return reply({ error: 'El servicio de IA todavía no está configurado. La comparativa calculada sigue disponible.' }, 503);
    const user = await getChatGPTUser();
    if (!user) return reply({ error: 'Inicia sesión para generar las conclusiones con IA.' }, 401);
    let input;
    try {
        if (Number(request.headers.get('content-length')) > 500000) return reply({ error: 'Demasiados datos para un análisis.' }, 413);
        const body = await request.text();
        if (body.length > 500000) return reply({ error: 'Demasiados datos para un análisis.' }, 413);
        input = competitionAnalysisInput.parse(JSON.parse(body));
    } catch { return reply({ error: 'Los datos de la competición no son válidos para el análisis.' }, 400); }
    try {
        const result = await generateCompetitionAI(input, key, model, request.signal);
        return reply({ ...result, generatedAt: new Date().toISOString(), code: input.data.code });
    } catch (e) { return reply({ error: e instanceof Error ? e.message : 'No se pudo generar el análisis.' }, 502); }
}
