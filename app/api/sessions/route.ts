import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {normalize} from '../../../lib/telemetry';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión para consultar tus archivos.'},{status:401});
 try{const result=await env.DB!.prepare('SELECT id,name,created_at as createdAt,object_key as objectKey FROM sessions WHERE owner = ? ORDER BY created_at DESC LIMIT 50').bind(user.userId).all();
 const data=await Promise.all(result.results.map(async(row)=>{const obj=await env.BUCKET!.get(String(row.objectKey));if(!obj)throw new Error('Archivo no disponible');return {id:row.id,name:row.name,createdAt:row.createdAt,samples:JSON.parse(await obj.text())};}));
 return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch{ return Response.json({error:'No se han podido recuperar las sesiones. Vuelve a intentarlo.'},{status:503});}
}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión para guardar tus datos.'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origen no permitido.'},{status:403});
 if(Number(req.headers.get('content-length'))>6000000)return Response.json({error:'El archivo es demasiado grande.'},{status:413});
 let data,samples;
 try{const text=await req.text();if(text.length>6000000)return Response.json({error:'El archivo es demasiado grande.'},{status:413});data=JSON.parse(text);if(typeof data.name!=='string'||!data.name.trim()||data.name.length>160)throw new Error('Nombre de sesión incorrecto.');samples=normalize(data.samples);}catch(e){return Response.json({error:e instanceof Error?e.message:'Archivo inválido.'},{status:400});}
 const id=crypto.randomUUID(),createdAt=new Date().toISOString(),key=`sessions/${user.userId}/${id}.json`;
 try{await env.BUCKET!.put(key,JSON.stringify(samples),{httpMetadata:{contentType:'application/json'}});await env.DB!.prepare('INSERT INTO sessions (id,owner,name,created_at,object_key) VALUES (?,?,?,?,?)').bind(id,user.userId,data.name.trim(),createdAt,key).run();return Response.json({id,name:data.name.trim(),createdAt,samples},{status:201});}catch{await env.BUCKET?.delete(key).catch(()=>{});return Response.json({error:'No se pudo guardar el archivo. Conserva el documento y vuelve a intentarlo.'},{status:503});}
}
