import Papa from 'papaparse';
export type Sample={time:number;pilot:string;motorTemp:number|null;batteryTemp:number|null;motorRpm:number|null;wheelRpm:number|null;speed:number;lat:number|null;lng:number|null};
export type CarCategory='F24'|'F24+';
export type CarId='car-1'|'car-2';
export type SessionType='training'|'race';
export type SessionContext='race-day'|'practice';
export const cars=[{id:'car-1',name:'Coche 1'},{id:'car-2',name:'Coche 2'}] as const;
export const stages=[{id:'f24plus-training',category:'F24+',type:'training',label:'Entrenamientos F24+'},{id:'f24plus-race',category:'F24+',type:'race',label:'Carrera F24+'},{id:'f24-training',category:'F24',type:'training',label:'Entrenamientos F24'},{id:'f24-race',category:'F24',type:'race',label:'Carrera F24'}] as const;
export type Session={id:string;name:string;createdAt:string;carCategory:CarCategory|null;carId:CarId|null;sessionType:SessionType|null;eventDate:string|null;sessionContext:SessionContext;samples:Sample[];demo?:boolean};
const aliases:Record<string,string[]>={time:['time','tiempo','timestamp','segundos'],pilot:['pilot','piloto','driver'],motorTemp:['motor_temp','temperatura_motor','motortemp'],batteryTemp:['battery_temp','temperatura_bateria','temperatura_baterias','batterytemp'],motorRpm:['motor_rpm','rpm_motor','motorrpm'],wheelRpm:['wheel_rpm','rpm_rueda','wheelrpm'],speed:['speed','velocidad','gps_speed','velocidad_gps'],lat:['lat','latitude','latitud'],lng:['lng','lon','longitude','longitud']};
function number(v:unknown):number|null{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null;}
export function normalize(rows:unknown[]):Sample[]{
 if(!rows.length||rows.length>10000)throw new Error('El archivo debe contener entre 1 y 10.000 muestras.');
 const out=rows.map((row,i)=>{
 if(!row||typeof row!=='object')throw new Error(`Fila ${i+2}: formato incorrecto.`);
 const raw=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase().trim().replace(/[\s-]+/g,'_'),v]));
 const get=(key:string)=>aliases[key].map(k=>raw[k]).find(v=>v!==undefined);
 const time=number(get('time')),speed=number(get('speed'));
 if(time===null||speed===null||time<0||speed<0||speed>250)throw new Error(`Fila ${i+2}: tiempo (segundos) y velocidad (km/h) deben ser números válidos.`);
 const pilot=String(get('pilot')??'').trim();if(!pilot||pilot.length>80)throw new Error(`Fila ${i+2}: indica el nombre del piloto (máximo 80 caracteres).`);
 const lat=number(get('lat')),lng=number(get('lng'));
 if((lat===null)!==(lng===null)||(lat!==null&&Math.abs(lat)>90)||(lng!==null&&Math.abs(lng)>180))throw new Error(`Fila ${i+2}: coordenadas GPS incorrectas.`);
 const fields={motorTemp:number(get('motorTemp')),batteryTemp:number(get('batteryTemp')),motorRpm:number(get('motorRpm')),wheelRpm:number(get('wheelRpm'))};
 for(const [k,v] of Object.entries(fields))if(v!==null&&(v<0||v>(k.endsWith('Rpm')?100000:300)))throw new Error(`Fila ${i+2}: valor fuera de rango en ${k}.`);
 return {time,speed,pilot,lat,lng,...fields};
 }).sort((a,b)=>a.time-b.time);
 for(let i=1;i<out.length;i++)if(out[i].time===out[i-1].time)throw new Error('Hay tiempos duplicados. Cada muestra debe tener un tiempo único dentro de la sesión.');
 return out;
}
export function parseCsv(text:string){const result=Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim().replace(/^\uFEFF/,'')});if(result.errors.length)throw new Error('No se pudo leer el CSV: '+result.errors[0].message);return normalize(result.data);}
export function stats(rows:Sample[]){let area=0,duration=0;for(let i=1;i<rows.length;i++){const dt=rows[i].time-rows[i-1].time;if(dt>0){area+=(rows[i].speed+rows[i-1].speed)/2*dt;duration+=dt;}}const mean=duration?area/duration:rows[0]?.speed??0;const dev=Math.sqrt(rows.reduce((s,r)=>s+(r.speed-mean)**2,0)/Math.max(1,rows.length));const max=(key:'motorTemp'|'batteryTemp')=>{const a=rows.flatMap(r=>r[key]===null?[]:[r[key] as number]);return a.length?Math.max(...a):null;};return {mean,maxSpeed:Math.max(0,...rows.map(r=>r.speed)),duration,distance:area/3600,deviation:dev,maxMotor:max('motorTemp'),maxBattery:max('batteryTemp')};}
export const demo:Session={id:'demo-f24',sessionContext:'race-day',carCategory:'F24',carId:'car-1',sessionType:'training',eventDate:'2026-10-08',name:'F24 · entrenamiento de ejemplo',createdAt:'2026-10-08T10:00:00Z',demo:true,samples:Array.from({length:181},(_,i)=>{const a=i/30*Math.PI*2;return {time:i*5,pilot:i<60?'Alex Martín':i<120?'Lucía Pérez':'Dani Alonso',speed:Math.round((38+9*Math.sin(a+.4)+3*Math.cos(a*3))*10)/10,motorTemp:Math.round((48+i*.07+2*Math.sin(a))*10)/10,batteryTemp:Math.round((28+i*.025)*10)/10,motorRpm:Math.round(2100+420*Math.sin(a+.4)),wheelRpm:Math.round(370+75*Math.sin(a+.4)),lat:40.615+Math.sin(a)*.0022,lng:-3.585+Math.cos(a)*.005+Math.sin(a*2)*.001};})};

export const raceDemoSessions:Session[]=stages.flatMap((stage,i)=>cars.map((car,j)=>({...demo,id:`demo-${stage.id}-${car.id}`,carId:car.id,carCategory:stage.category,sessionType:stage.type,name:`${car.name} · ${stage.label} · ejemplo`,createdAt:`2026-10-08T${String(8+i*2).padStart(2,'0')}:00:00Z`,samples:demo.samples.map(row=>({...row,speed:Math.round(row.speed*(1+i*.025+j*.02)*10)/10}))})));
export const practiceDemoSessions:Session[]=cars.map(c=>({...demo,id:`demo-practice-${c.id}`,carId:c.id,carCategory:null,sessionContext:'practice',sessionType:'training',name:`${c.name} · prácticas · ejemplo`}));
export const demoSessions:Session[]=[...raceDemoSessions,...practiceDemoSessions];
export function validateSessionDetails(data:{carId?:unknown;carCategory?:unknown;sessionType?:unknown;eventDate?:unknown;sessionContext?:unknown}){
 if(data.carId!=='car-1'&&data.carId!=='car-2')throw new Error('Selecciona Coche 1 o Coche 2.');
 if(data.sessionContext!=='race-day'&&data.sessionContext!=='practice')throw new Error('Selecciona jornada de carrera o día de prácticas.');
 if(data.sessionContext==='practice'&&(data.sessionType!=='training'||data.carCategory!==null))throw new Error('Las prácticas son entrenamientos sin categoría de carrera.');
 if(data.sessionContext==='race-day'&&data.carCategory!=='F24'&&data.carCategory!=='F24+')throw new Error('Selecciona la categoría F24 o F24+.');
 if(data.sessionType!=='training'&&data.sessionType!=='race')throw new Error('Selecciona entrenamiento o carrera.');
 if(typeof data.eventDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.eventDate))throw new Error('Indica una fecha válida para la jornada.');
 const date=new Date(data.eventDate+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==data.eventDate)throw new Error('La fecha de la jornada no es válida.');
 return {carId:data.carId as CarId,carCategory:data.carCategory as CarCategory|null,sessionContext:data.sessionContext as SessionContext,sessionType:data.sessionType as SessionType,eventDate:data.eventDate};
}
export function isUnclassified(s:Session){return !s.carId||!s.eventDate||!s.sessionType||(s.sessionContext!=='practice'&&!s.carCategory);}
export function sessionsFor(sessions:Session[],car:CarId|'unassigned',day:string,stage:typeof stages[number],context:SessionContext='race-day'):Session[]{return sessions.filter(s=>car==='unassigned'?isUnclassified(s):s.carId===car&&s.eventDate===day&&(s.sessionContext??'race-day')===context&&(context==='practice'?s.sessionType==='training':s.carCategory===stage.category&&s.sessionType===stage.type));}
