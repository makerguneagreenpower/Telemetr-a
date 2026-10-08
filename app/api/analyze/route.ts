import {getChatGPTUser} from '../../chatgpt-auth';
export async function POST(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión para solicitar el análisis.'},{status:401});return Response.json({error:'La IA aún no está conectada. Activa OpenAI Developers para configurar el servicio. Puedes consultar las métricas calculadas de cada piloto.'},{status:503});}
