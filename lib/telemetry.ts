import Papa from 'papaparse';
export type Sample={time:number;pilot:string;motorTemp:number|null;batteryTemp:number|null;motorRpm:number|null;wheelRpm:number|null;speed:number;lat:number|null;lng:number|null};
export type Session={id:string;name:string;createdAt:string;samples:Sample[];demo?:boolean};
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
export const demo:Session={id:'demo',name:'Entrenamiento · sesión de ejemplo',createdAt:'2026-10-08T10:00:00Z',demo:true,samples:Array.from({length:181},(_,i)=>{const a=i/30*Math.PI*2;return {time:i*5,pilot:i<60?'Alex Martín':i<120?'Lucía Pérez':'Dani Alonso',speed:Math.round((38+9*Math.sin(a+.4)+3*Math.cos(a*3))*10)/10,motorTemp:Math.round((48+i*.07+2*Math.sin(a))*10)/10,batteryTemp:Math.round((28+i*.025)*10)/10,motorRpm:Math.round(2100+420*Math.sin(a+.4)),wheelRpm:Math.round(370+75*Math.sin(a+.4)),lat:40.615+Math.sin(a)*.0022,lng:-3.585+Math.cos(a)*.005+Math.sin(a*2)*.001};})};
