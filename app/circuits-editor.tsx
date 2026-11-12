'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, Flag, ImagePlus, MapPinned, Mountain, Pencil, Play, Ruler, Save, Trash2, Undo2, Upload } from 'lucide-react';
import { fetchTerrainHeights } from '../lib/terrain-elevation';
import { circuitKml, createCircuitRuntime, geoToVertices, imageToVertices, parseGeographicRoutes, validateCircuit, type CircuitDefinition, type CircuitPoint, type CircuitRuntime, type GeographicRoute } from '../lib/circuits';
import { deleteCircuit, saveCircuit, setActiveCircuit } from '../lib/circuit-storage';
import { useCircuits } from './use-circuits';
import CircuitDrawingMap, { type DrawingTool } from './circuit-drawing-map';
import CircuitRealWorldPreview from './circuit-real-world-preview';

type History = { mode: 'image' | 'map'; points: CircuitPoint[]; calibration: CircuitPoint[] };
const errorMessage = (error: unknown) => error instanceof SyntaxError ? 'El archivo no contiene un JSON válido. Comprueba que has exportado el recorrido correcto.' : error instanceof Error ? error.message : 'No se pudo completar la operación.';
const sourceLabel = (source: CircuitDefinition['source']) => source === 'image' ? 'Imagen calibrada' : source === 'map' ? 'Trazado sobre mapa' : source === 'kml' ? 'Google Earth / KML' : 'GeoJSON';
function download(name: string, data: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const toGeo = (p: CircuitPoint) => p.y === undefined ? { lat: p.z, lng: p.x } : { lat: p.z, lng: p.x, alt: p.y };
const fromGeo = (p: { lat: number; lng: number; alt?: number }): CircuitPoint => p.alt === undefined ? { x: p.lng, z: p.lat } : { x: p.lng, z: p.lat, y: p.alt };
const metresLabel = (value: number) => `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`;
function ElevationProfile({ runtime }: { runtime: CircuitRuntime }) {
    const { outline, elevation, length } = runtime, top = Math.max(elevation.range, 1);
    const line = outline.map((p, i) => `${(i / (outline.length - 1) * 100).toFixed(2)},${(38 - p.y / top * 34).toFixed(2)}`).join(' ');
    return <div className="circuit-elevation">
        <div className="circuit-elevation-heading"><strong>Perfil de altura</strong><span>{elevation.hasElevation ? `Desnivel ${metresLabel(elevation.range)} · Subida acumulada ${metresLabel(elevation.climb)} · Pendiente máx. ${(elevation.maxGrade * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : 'Circuito llano. Selecciona un punto y escribe su altura para añadir subidas y bajadas.'}</span></div>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Perfil de altura a lo largo de ${metresLabel(length)}`}><polygon points={`0,40 ${line} 100,40`} fill="var(--red)" opacity=".14"/><polyline points={line} fill="none" stroke="var(--red)" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/></svg>
        <div className="circuit-elevation-axis"><span>Meta</span><span>{metresLabel(length)}</span></div>
    </div>;
}
function filename(name: string) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w-]+/g,'-').slice(0,70) || 'circuito'; }

export default function CircuitsEditor({ onRace }: { onRace: () => void }) {
    const library = useCircuits();
    const [mode, setMode] = useState<'image' | 'map'>('image');
    const [name, setName] = useState(''), [competition, setCompetition] = useState(''), [width, setWidth] = useState('6');
    const [image, setImage] = useState<CircuitDefinition['referenceImage']>();
    const [imagePoints, setImagePoints] = useState<CircuitPoint[]>([]), [geoPoints, setGeoPoints] = useState<CircuitPoint[]>([]);
    const [calibration, setCalibration] = useState<CircuitPoint[]>([]), [metres, setMetres] = useState('');
    const [tool, setTool] = useState<DrawingTool>('trace'), [selected, setSelected] = useState<number | null>(null);
    const [history, setHistory] = useState<History[]>([]), [editingId, setEditingId] = useState<string>();
    const [source, setSource] = useState<'map'|'kml'|'geojson'>('map');
    const [routes, setRoutes] = useState<GeographicRoute[]>([]), [routeIndex, setRouteIndex] = useState(0);
    const [fitVersion, setFitVersion] = useState(0), [lat, setLat] = useState('40.4168'), [lng, setLng] = useState('-3.7038');
    const [center, setCenter] = useState({ lat:40.4168, lng:-3.7038, revision:0 });
    const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState('');
    const [deleted, setDeleted] = useState<CircuitDefinition>();
    const [terrainBusy, setTerrainBusy] = useState(false), terrainRequest = useRef<AbortController | null>(null);
    const imageInput = useRef<HTMLInputElement>(null), routeInput = useRef<HTMLInputElement>(null), editor = useRef<HTMLElement>(null);
    const points = mode === 'image' ? imagePoints : geoPoints;
    const geographicRoute = useMemo(() => geoPoints.map(toGeo), [geoPoints]);
    const realWorldKey = geographicRoute.map(point => `${point.lat},${point.lng}`).join(';');
    const preview = useMemo(() => {
        try {
            const definition: CircuitDefinition = { version:1, id:editingId ?? 'preview', name:name.trim() || 'Circuito sin nombre', competition:competition.trim(), width:Number(width), source:mode==='image'?'image':source, vertices:mode==='image'?imageToVertices(imagePoints,calibration,Number(metres)):geoToVertices(geoPoints.map(toGeo)), updatedAt:'preview' };
            if (image) definition.referenceImage = image;
            if(mode==='image' && calibration.length===2) definition.imageDrawing={points:imagePoints,calibration:calibration as [CircuitPoint,CircuitPoint],metres:Number(metres)};
            else if(mode==='map') definition.geographic=geoPoints.map(toGeo);
            const valid=validateCircuit(definition);
            return { definition:valid, runtime:createCircuitRuntime(valid), error:'' };
        } catch(error) { return { definition:null, runtime:null, error:errorMessage(error) }; }
    },[mode,editingId,name,competition,width,source,imagePoints,geoPoints,calibration,metres,image]);

    function remember() { setHistory(old=>[...old.slice(-49),{mode,points:[...points],calibration:[...calibration]}]); }
    function replacePoints(next: CircuitPoint[], rememberChange = true) { if(rememberChange) remember(); if(mode==='image')setImagePoints(next);else setGeoPoints(next); }
    function undo() { const previous=history[history.length-1];if(!previous)return;setMode(previous.mode);if(previous.mode==='image')setImagePoints(previous.points);else setGeoPoints(previous.points);setCalibration(previous.calibration);setHistory(old=>old.slice(0,-1));setSelected(null); }
    function chooseMode(next: 'image'|'map') { setMode(next);setSelected(null);setTool('trace');setFitVersion(value=>value+1); }
    function fresh() { setName('');setCompetition('');setWidth('6');setImage(undefined);setImagePoints([]);setGeoPoints([]);setCalibration([]);setMetres('');setHistory([]);setEditingId(undefined);setSelected(null);setSource('map');setRoutes([]);setMessage('');setError('');setMode('image');setTool('trace'); }
    function load(circuit: CircuitDefinition) {
        setName(circuit.name);setCompetition(circuit.competition);setWidth(String(circuit.width));setEditingId(circuit.id);setImage(circuit.referenceImage);setHistory([]);setSelected(null);setRoutes([]);setError('');setMessage('Circuito cargado en el editor. Los cambios se aplican al guardar.');
        if(circuit.source==='image'&&circuit.imageDrawing){setMode('image');setImagePoints(circuit.imageDrawing.points);setCalibration(circuit.imageDrawing.calibration);setMetres(String(circuit.imageDrawing.metres));}
        else if(circuit.geographic){setLat(String(circuit.geographic[0].lat));setLng(String(circuit.geographic[0].lng));setMode('map');setGeoPoints(circuit.geographic.map(fromGeo));setSource(circuit.source==='kml'?'kml':circuit.source==='geojson'?'geojson':'map');}
        setTool('trace');setFitVersion(value=>value+1);editor.current?.scrollIntoView({behavior:'smooth',block:'start'});
    }
    async function readImage(file?: File) {
        if(!file)return;setError('');
        try {
            if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6_000_000)throw new Error('Selecciona una imagen PNG, JPG o WebP de hasta 6 MB.');
            const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('No se pudo leer la imagen.'));reader.readAsDataURL(file);});
            const size=await new Promise<{width:number;height:number}>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error('No se pudo abrir la imagen.'));img.src=dataUrl;});
            if(size.width>20000||size.height>20000||size.width*size.height>60_000_000)throw new Error('La imagen es demasiado grande. Usa un plano de hasta 60 megapíxeles.');
            setImage({dataUrl,...size});setImagePoints([]);setCalibration([]);setMetres('');setMode('image');setTool('calibrate');setSelected(null);setHistory([]);setFitVersion(value=>value+1);setMessage('Imagen cargada. Marca dos puntos A y B cuya distancia real conozcas para fijar la escala.');
            if(!name)setName(file.name.replace(/\.[^.]+$/,''));
        }catch(error){setError(errorMessage(error));}
    }
    function chooseRoute(route: GeographicRoute,index:number) {
        let next=route.points.map(fromGeo);
        next=next.filter((p,i)=>!i||p.x!==next[i-1].x||p.z!==next[i-1].z);
        if(next.length>1&&next[0].x===next[next.length-1].x&&next[0].z===next[next.length-1].z)next=next.slice(0,-1);
        setLat(String(route.points[0].lat));setLng(String(route.points[0].lng));setGeoPoints(next);setSource(route.source);setRouteIndex(index);setMode('map');setTool('trace');setSelected(null);setHistory([]);setFitVersion(value=>value+1);if(!name||name===routes[routeIndex]?.name)setName(route.name);
    }
    async function readRoute(file?:File) {
        if(!file)return;setError('');
        try {
            if(file.size>12_000_000)throw new Error('El archivo supera el límite de 12 MB.');
            if(/\.kmz$/i.test(file.name))throw new Error('Exporta desde Google Earth/My Maps como .kml sin comprimir, o descomprime el KMZ y selecciona su archivo KML.');
            const text=await file.text();
            if(!/\.kml$/i.test(file.name)){const parsed:unknown=JSON.parse(text);if(parsed&&typeof parsed==='object'&&'version'in parsed&&parsed.version===1){load(validateCircuit(parsed));setMessage('Archivo de circuito importado. Revisa la vista previa y guárdalo en la biblioteca.');return;}}
            const imported=parseGeographicRoutes(text,/\.kml$/i.test(file.name)?'kml':'geojson');setEditingId(undefined);setName(imported[0].name);setRoutes(imported);chooseRoute(imported[0],0);setMessage(imported.length>1?'Hay varios recorridos: elige el que corresponde a la carrera.':'Recorrido importado. Revisa meta, sentido y ancho antes de guardar.');
        }catch(error){setError(errorMessage(error));}
    }
    async function save(useInRace=false) {
        if(!preview.definition||!name.trim())return;setBusy(true);setError('');
        try { const circuit={...preview.definition,id:editingId??crypto.randomUUID(),updatedAt:new Date().toISOString()};await saveCircuit(circuit);setEditingId(circuit.id);setMessage('Circuito guardado en este navegador. Exporta una copia para compartirlo con el equipo.');if(useInRace){setActiveCircuit(circuit.id);onRace();} }
        catch(error){setError(errorMessage(error));}finally{setBusy(false);}
    }
    async function loadTerrain() {
        if(geoPoints.length<3){setError('Traza al menos tres puntos sobre el mapa antes de pedir las alturas.');return;}
        if(geoPoints.some(p=>p.y!==undefined)&&!window.confirm('Se sustituirán las alturas que ya tiene el trazado por las del terreno. ¿Continuar? (Puedes deshacerlo después.)'))return;
        terrainRequest.current?.abort();const controller=new AbortController();terrainRequest.current=controller;
        setTerrainBusy(true);setError('');setMessage('Consultando el modelo de terreno…');
        try{
            const result=await fetchTerrainHeights(geoPoints.map(toGeo),controller.signal);
            remember();setGeoPoints(result.points.map(fromGeo));
            setMessage(result.range<1?`Alturas obtenidas en ${result.sampled} puntos: el terreno es prácticamente llano aquí (menos de 1 m de desnivel).`:`Alturas del terreno obtenidas en ${result.sampled} puntos · ${metresLabel(result.range)} de desnivel.${result.softened?' Algunas rampas muy empinadas se han suavizado para la simulación.':''} Revisa el perfil: el modelo tiene una resolución de unos 90 m y no ve puentes ni túneles.`);
        }catch(error){if(!controller.signal.aborted){setMessage('');setError(errorMessage(error));}}
        finally{if(terrainRequest.current===controller){terrainRequest.current=null;setTerrainBusy(false);}}
    }
    function selectCircuit(circuit:CircuitDefinition){try{setActiveCircuit(circuit.id);onRace();}catch(error){setError(errorMessage(error));}}
    async function remove(circuit:CircuitDefinition){try{await deleteCircuit(circuit.id);setDeleted(circuit);setMessage(`«${circuit.name}» eliminado. Puedes deshacerlo.`);}catch(error){setError(errorMessage(error));}}
    async function restore(){if(!deleted)return;try{await saveCircuit(deleted);setDeleted(undefined);setMessage('Circuito restaurado.');}catch(error){setError(errorMessage(error));}}
    function exportCircuit(circuit:CircuitDefinition,kml=false){try{download(`${filename(circuit.name)}.${kml?'kml':'json'}`,kml?circuitKml(circuit):JSON.stringify(circuit,null,2),kml?'application/vnd.google-earth.kml+xml':'application/json');}catch(error){setError(errorMessage(error));}}
    function locate(){const latitude=Number(lat.replace(',','.')),longitude=Number(lng.replace(',','.'));if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>85||Math.abs(longitude)>180){setError('Introduce una latitud y una longitud válidas.');return;}setLat(String(latitude));setLng(String(longitude));setCenter(old=>({lat:latitude,lng:longitude,revision:old.revision+1}));setError('');}
    const filtered=library.circuits.filter(c=>`${c.name} ${c.competition}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));

    return <div className="circuits-workspace">
        <div className="circuit-intro panel"><div><h2>Del plano a la pista</h2><p>Traza la línea central sobre la imagen recibida o importa las coordenadas de Google Earth/My Maps. El circuito se usará en el mapa, las vueltas y la carrera 3D de los dos coches.</p></div><button type="button" className="secondary" onClick={fresh}><Pencil size={17}/>Nuevo circuito</button></div>
        {(error||library.error)&&<p className="notice" role="alert">{error||library.error}</p>}{message&&<div className="notice" role="status">{message}{deleted&&<button type="button" onClick={restore}>Deshacer eliminación</button>}</div>}
        <section className="panel circuit-editor" ref={editor}>
            <div className="panel-heading"><div><h2>{editingId?'Editar circuito':'Crear circuito'}</h2><p>El primer punto es la meta. Los puntos se recorren en el orden en que los marques.</p></div></div>
            <div className="circuit-methods" role="group" aria-label="Origen del trazado"><button type="button" aria-pressed={mode==='image'} onClick={()=>chooseMode('image')}><ImagePlus size={21}/><span><strong>Desde una imagen</strong><small>Subir plano, calibrar y trazar</small></span></button><button type="button" aria-pressed={mode==='map'} onClick={()=>chooseMode('map')}><MapPinned size={21}/><span><strong>Dibujar sobre el mapa</strong><small>Coordenadas y escala geográfica</small></span></button><button type="button" onClick={()=>routeInput.current?.click()}><Upload size={21}/><span><strong>Importar recorrido</strong><small>KML, GeoJSON o circuito JSON</small></span></button></div>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" aria-label="Subir imagen del circuito" onChange={event=>{void readImage(event.target.files?.[0]);event.target.value='';}}/>
            <input ref={routeInput} type="file" accept=".kml,.geojson,.json" className="visually-hidden" aria-label="Importar archivo de circuito" onChange={event=>{void readRoute(event.target.files?.[0]);event.target.value='';}}/>
            <div className="circuit-editor-fields"><label>Nombre del circuito<input value={name} maxLength={100} placeholder="Ej. Circuito de la carrera de Bilbao" onChange={e=>setName(e.target.value)}/></label><label>Carrera / competición<input value={competition} maxLength={150} placeholder="Ej. Jornada F24 · Bilbao 2026" onChange={e=>setCompetition(e.target.value)}/></label><label>Ancho de pista (m)<input type="number" min={3} max={20} step={.1} value={width} onChange={e=>setWidth(e.target.value)}/></label></div>
            {mode==='image'?<div className="circuit-source-settings"><button type="button" className="secondary" onClick={()=>imageInput.current?.click()}><ImagePlus size={17}/>{image?'Cambiar imagen':'Subir imagen del plano'}</button><label>Distancia real A–B (m)<input type="number" min={.1} max={50000} step={.1} value={metres} placeholder="Ej. 100" onChange={e=>setMetres(e.target.value)}/></label><p>Marca dos extremos de una recta o de la escala del plano. Sin esa medida, una imagen no define distancias reales.</p></div>:<div className="circuit-source-settings"><label>Latitud<input inputMode="decimal" value={lat} onChange={e=>setLat(e.target.value)}/></label><label>Longitud<input inputMode="decimal" value={lng} onChange={e=>setLng(e.target.value)}/></label><button type="button" className="secondary" onClick={locate}><MapPinned size={16}/>Ir a coordenadas</button><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`} target="_blank" rel="noopener noreferrer">Abrir Google Maps <ExternalLink size={13}/></a><div className="circuit-terrain"><button type="button" className="secondary" disabled={terrainBusy||geoPoints.length<3} onClick={()=>void loadTerrain()}><Mountain size={16}/>{terrainBusy?'Obteniendo alturas…':'Obtener alturas del terreno'}</button><small>Rellena subidas y bajadas con el relieve real (Copernicus, ~90 m). Envía las coordenadas del trazado a <a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.</small></div></div>}
            {routes.length>1&&mode==='map'&&<label className="circuit-route-choice">Recorrido del archivo<select value={routeIndex} onChange={e=>chooseRoute(routes[Number(e.target.value)],Number(e.target.value))}>{routes.map((route,index)=><option value={index} key={index}>{route.name} · {route.points.length} puntos</option>)}</select></label>}
            <div className="circuit-tools" role="group" aria-label="Herramientas de trazado"><button type="button" aria-pressed={tool==='trace'} onClick={()=>setTool('trace')}><Pencil size={15}/>Trazar</button><button type="button" aria-pressed={tool==='select'} onClick={()=>setTool('select')}>Seleccionar / mover</button>{mode==='image'&&<button type="button" aria-pressed={tool==='calibrate'} onClick={()=>setTool('calibrate')}><Ruler size={15}/>Calibrar A–B</button>}<button type="button" onClick={undo} disabled={!history.length}><Undo2 size={15}/>Deshacer</button><button type="button" onClick={()=>setFitVersion(v=>v+1)}>Centrar trazado</button></div>
            {mode==='image'&&!image?<button type="button" className="circuit-upload-empty" onClick={()=>imageInput.current?.click()}><ImagePlus size={38}/><strong>Selecciona la imagen que os han pasado</strong><span>PNG, JPG o WebP · hasta 6 MB</span></button>:<CircuitDrawingMap mode={mode} image={mode==='image'?image:undefined} points={points} calibration={mode==='image'?calibration:[]} tool={tool} selected={selected} fitVersion={fitVersion} center={center} onAdd={p=>{if(points.length>=5000){setError('El circuito admite hasta 5000 puntos.');return;}replacePoints([...points,p]);setSelected(points.length);}} onMove={(index,p)=>replacePoints(points.map((old,i)=>i===index?(old.y===undefined?p:{...p,y:old.y}):old))} onSelect={setSelected} onCalibrate={p=>{remember();setCalibration(old=>old.length<2?[...old,p]:[p]);}}/>}
            <div className="circuit-point-tools"><label>Punto seleccionado<input type="number" min={1} max={points.length||1} value={selected===null?'':selected+1} placeholder="—" onChange={e=>{const n=Number(e.target.value);setSelected(Number.isInteger(n)&&n>=1&&n<=points.length?n-1:null);}}/></label><label title="Déjalo vacío para que se calcule entre los puntos que sí tienen altura">Altura del punto (m)<input type="number" step={.1} min={-9000} max={9000} disabled={selected===null||!points[selected]} value={selected!==null&&points[selected]?.y!==undefined?points[selected].y:''} placeholder={selected===null?'—':'Automática'} onFocus={remember} onChange={e=>{if(selected===null)return;const raw=e.target.value.replace(',','.'),value=Number(raw);replacePoints(points.map((p,i)=>i!==selected?p:raw.trim()===''||!Number.isFinite(value)?{x:p.x,z:p.z}:{...p,y:value}),false);}}/></label><button type="button" className="secondary" disabled={selected===null} onClick={()=>{if(selected===null)return;replacePoints([...points.slice(selected),...points.slice(0,selected)]);setSelected(0);}}><Flag size={15}/>Marcar como meta</button><button type="button" className="secondary" disabled={points.length<2} onClick={()=>{replacePoints([points[0],...points.slice(1).reverse()]);setSelected(0);}}>Invertir sentido</button><button type="button" className="secondary" disabled={selected===null} onClick={()=>{replacePoints(points.filter((_,index)=>index!==selected));setSelected(null);}}><Trash2 size={15}/>Eliminar punto</button><button type="button" className="text-button" disabled={!points.length} onClick={()=>{replacePoints([]);setSelected(null);}}>Vaciar trazado</button></div>
            <div className="circuit-preview-summary"><div><span>Puntos</span><strong>{points.length}</strong></div><div><span>Longitud del circuito cerrado</span><strong>{preview.runtime?`${preview.runtime.length.toLocaleString('es-ES',{maximumFractionDigits:1})} m`:'—'}</strong></div><div><span>Origen</span><strong>{mode==='image'?'Imagen y escala manual':sourceLabel(source)}</strong></div><p>{preview.error||'Trazado preparado. La línea discontinua une el último punto con la meta.'}</p></div>
            {preview.runtime&&<ElevationProfile runtime={preview.runtime}/>}
            <CircuitRealWorldPreview key={realWorldKey} track={mode==='map'?preview.runtime:null} route={geographicRoute}/>
            {mode==='map'&&image&&<details className="circuit-reference-image"><summary>Consultar imagen recibida como referencia</summary><img src={image.dataUrl} width={image.width} height={image.height} alt="Plano original de la carrera para comparar con el trazado del mapa"/></details>}
            <div className="circuit-save-actions"><button type="button" className="primary" disabled={busy||!preview.definition||!name.trim()} onClick={()=>save(true)}><Play size={17}/>{busy?'Guardando…':'Guardar y probar con los dos coches'}</button><button type="button" className="secondary" disabled={busy||!preview.definition||!name.trim()} onClick={()=>save()}><Save size={17}/>Guardar circuito</button>{preview.definition&&<button type="button" className="secondary" onClick={()=>exportCircuit({...preview.definition!,id:editingId??crypto.randomUUID(),updatedAt:new Date().toISOString()})}><Download size={16}/>Exportar borrador</button>}</div>
        </section>
        <section className="panel circuit-library"><div className="panel-heading"><div><h2>Circuitos guardados</h2><p>Guardados en este navegador. Exporta el JSON para compartir imagen, escala y recorrido con el equipo.</p></div><label className="circuit-search">Buscar<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Circuito o competición"/></label></div>{library.loading?<p className="circuit-library-empty">Cargando biblioteca…</p>:!filtered.length?<p className="circuit-library-empty">{query?'No hay circuitos que coincidan con la búsqueda.':'Todavía no has guardado ningún circuito. Crea uno arriba o importa un archivo del equipo.'}</p>:<div className="circuit-library-grid">{filtered.map(circuit=>{const runtime=createCircuitRuntime(circuit);return <article className="circuit-library-card" key={circuit.id}><svg viewBox={runtime.viewBox} role="img" aria-label={`Trazado de ${circuit.name}`}><polyline points={runtime.outline.map(p=>`${p.x},${p.z}`).join(' ')} fill="none" stroke="var(--red)" strokeWidth={Math.max(runtime.width,runtime.bounds.span*.018)} strokeLinejoin="round"/></svg><h3>{circuit.name}</h3><p>{circuit.competition||'Sin competición asignada'}</p><small>{Math.round(runtime.length).toLocaleString('es-ES')} m · {circuit.width} m de ancho{runtime.elevation.hasElevation?` · ${metresLabel(runtime.elevation.range)} de desnivel`:''} · {sourceLabel(circuit.source)}</small>{library.activeId===circuit.id&&<span className="circuit-active-badge">Seleccionado en Carrera</span>}<div className="circuit-card-actions"><button type="button" className="primary" onClick={()=>selectCircuit(circuit)}><Play size={15}/>Usar en Carrera</button><button type="button" className="secondary" onClick={()=>load(circuit)}>Editar</button><button type="button" className="secondary" onClick={()=>exportCircuit(circuit)} aria-label={`Exportar JSON de ${circuit.name}`}>JSON</button><button type="button" className="secondary" disabled={!circuit.geographic} onClick={()=>exportCircuit(circuit,true)} aria-label={`Exportar KML de ${circuit.name}`}>KML</button><button type="button" className="secondary" onClick={()=>remove(circuit)} aria-label={`Eliminar ${circuit.name}`}><Trash2 size={15}/></button></div></article>;})}</div>}</section>
        <section className="panel circuit-google-guide"><div><h2>Prepararlo en Google Earth o My Maps</h2><p>Abre el lugar, dibuja el recorrido por el centro de la pista y exporta el proyecto o la capa como <strong>KML sin comprimir</strong>. Después pulsa «Importar recorrido» y revisa la meta y el ancho.</p><p>El KML conserva coordenadas y escala geográfica. La precisión depende de la imagen y del trazado que hagáis. Si el KML trae alturas (tercera coordenada), se usan como subidas y bajadas; los recorridos «pegados al suelo» de Google Earth suelen exportarse con altura 0, así que en ese caso puedes obtener el relieve real desde el editor.</p></div><div><a href="https://earth.google.com/web/" target="_blank" rel="noopener noreferrer">Abrir Google Earth <ExternalLink size={14}/></a><a href="https://www.google.com/maps/d/" target="_blank" rel="noopener noreferrer">Abrir My Maps <ExternalLink size={14}/></a><a href="https://developers.google.com/maps/documentation/earth/quickstart" target="_blank" rel="noopener noreferrer">Ayuda de Google Earth <ExternalLink size={14}/></a><a href="https://support.google.com/mymaps/answer/3109452?hl=es" target="_blank" rel="noopener noreferrer">Exportar desde My Maps <ExternalLink size={14}/></a></div></section>
    </div>;
}
