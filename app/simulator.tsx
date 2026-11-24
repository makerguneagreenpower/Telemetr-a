'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Expand, Minimize, Gamepad2, Keyboard, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { createCircuitRuntime, DEMO_TRACK, type CircuitRuntime, type CircuitDefinition } from '../lib/circuits';
import { FIXED_STEP, createPlayerWorld, keyboardDrivingInput, recoverPlayer, stepPlayerWorld, type DrivingInput, type RaceVehicle } from '../lib/race-engine';
import { createPlayerGapTracker, type PlayerGap } from '../lib/simulator-timing';
import type { RaceCamera } from '../lib/race-3d';
import { deleteSavedCircuit, restoreSavedCircuit, setActiveCircuit } from '../lib/circuit-storage';
import { useCircuits } from './use-circuits';
import { START_LIGHT_SECONDS, advanceStartLights, startLightCount } from '../lib/simulator-start';

type ControlMode='keyboard'|'wheel';
type Gear=1|-1;
type SimulatorView=RaceCamera|'split'|'split-cockpit';
const EMPTY_INPUT:DrivingInput={throttle:0,brake:0,steering:0};
const lapTime=(seconds:number|null)=>seconds===null?'—':`${Math.floor(Math.max(0,seconds)/60)}:${(Math.max(0,seconds)%60).toFixed(2).padStart(5,'0')}`;
function isTypingTarget(target:EventTarget|null){return target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));}
function readWheelInput(inverted:boolean):{input:DrivingInput;name:string|null}{
    const pad=Array.from(navigator.getGamepads?.()??[]).find((candidate):candidate is Gamepad=>!!candidate?.connected);
    if(!pad)return {input:EMPTY_INPUT,name:null};
    const axis=pad.axes[0]??0;
    const trigger=(v:number|undefined)=>v===undefined||Math.abs(v)<.04?0:v<0?(v+1)/2:v;
    return {input:{steering:Math.abs(axis)<.04?0:Math.max(-1,Math.min(1,axis))*(inverted?-1:1),throttle:Math.max(pad.buttons[7]?.value??0,pad.mapping==='standard'?0:trigger(pad.axes[2])),brake:Math.max(pad.buttons[6]?.value??0,pad.mapping==='standard'?0:trigger(pad.axes[3]))},name:pad.id||'Volante / mando'};
}

export default function Simulator({onManageCircuits,user=false}:{onManageCircuits:()=>void;user?:boolean}){
    const library=useCircuits();
    const [selectedId,setSelectedId]=useState<string|null>(null),[players,setPlayers]=useState<1|2>(2),[error,setError]=useState('');
    const [deleted,setDeleted]=useState<CircuitDefinition|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const definition=library.circuits.find(c=>c.id===(selectedId??library.activeId));
    const track=useMemo(()=>definition?createCircuitRuntime(definition):DEMO_TRACK,[definition]);
    function chooseTrack(id:string){setSelectedId(id);setError('');try{setActiveCircuit(id);}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo seleccionar la pista.');}}
    async function removeTrack(){
        if(!definition||busy)return;setBusy(true);setError('');
        try{await deleteSavedCircuit(definition,user);setDeleted(definition);setSelectedId('demo');setMessage(`«${definition.name}» eliminado.`);}
        catch(cause){setError(cause instanceof Error?cause.message:'No se pudo eliminar la pista.');}finally{setBusy(false);}
    }
    async function undoDelete(){
        if(!deleted||busy)return;setBusy(true);setError('');
        try{await restoreSavedCircuit(deleted,user);setMessage('Circuito restaurado.');setDeleted(null);}
        catch(cause){setError(cause instanceof Error?cause.message:'No se pudo restaurar la pista.');}finally{setBusy(false);}
    }
    return <div className="simulator">
        <section className="panel simulator-setup">
            <label htmlFor="simulator-track">Pista<select id="simulator-track" value={track.id} disabled={library.loading} onChange={e=>chooseTrack(e.target.value)}><option value="demo">Circuito de demostración</option>{library.circuits.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label htmlFor="simulator-players">Jugadores<select id="simulator-players" value={players} onChange={e=>setPlayers(Number(e.target.value) as 1|2)}><option value={1}>1 jugador</option><option value={2}>2 jugadores · pantalla dividida</option></select></label>
            <div className="simulator-track-facts"><strong>{Math.round(track.length).toLocaleString('es-ES')} m</strong><span>{track.name}</span></div><button type="button" className="secondary" onClick={onManageCircuits}>Crear / editar pista</button><button type="button" className="secondary" disabled={!definition||busy} onClick={removeTrack}><Trash2 size={15}/>Eliminar pista</button>
            <p className="simulator-setup-note">Cambiar la pista o el número de jugadores inicia una carrera nueva. Se penaliza cuando las cuatro ruedas salen del asfalto y de su margen exterior de 1 m.</p>
        </section>
        {message&&<p className="notice" role="status">{message} {deleted&&<button type="button" disabled={busy} onClick={undoDelete}>Deshacer eliminación</button>}</p>}
        {(error||library.error)&&<p className="notice" role="alert">{error||library.error}</p>}
        {library.loading?<p role="status">Cargando pista…</p>:<PlayerRace key={`${track.id}:${track.revision}:${players}`} track={track} players={players}/>}
    </div>;
}

function PlayerRace({track,players}:{track:CircuitRuntime;players:1|2}){
    const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLElement>(null);
    const [world,setWorld]=useState(()=>createPlayerWorld(track)),worldRef=useRef(world);
    const keys=useRef(new Set<string>()),gapTracker=useRef(createPlayerGapTracker());
    const countdownRef=useRef(START_LIGHT_SECONDS),[countdown,setCountdown]=useState(START_LIGHT_SECONDS);
    const [gap,setGap]=useState<PlayerGap>(null),[gears,setGears]=useState<[Gear,Gear]>([1,1]);
    const [mode,setMode]=useState<ControlMode>('keyboard'),[running,setRunning]=useState(true),[inverted,setInverted]=useState(false);
    const [camera,setCamera]=useState<SimulatorView>(players===2?'split':'player');
    const [wheelName,setWheelName]=useState<string|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[ready,setReady]=useState(false),[fullscreen,setFullscreen]=useState(false),[fullscreenError,setFullscreenError]=useState('');
    const settings=useRef({mode,running,inverted,camera,gears});
    useEffect(()=>{settings.current={mode,running,inverted,camera,gears};},[mode,running,inverted,camera,gears]);
    useEffect(()=>{const changed=()=>setFullscreen(document.fullscreenElement===stage.current);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);

    useEffect(()=>{
        function down(event:KeyboardEvent){
            if(isTypingTarget(event.target)||event.ctrlKey||event.metaKey||event.altKey)return;
            const key=event.key.toLowerCase();
            if(key===' '&&event.target instanceof HTMLElement&&['BUTTON','A'].includes(event.target.tagName))return;
            if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' ','r','f','e','q'].includes(key)){
                event.preventDefault();
                if(key==='e'||key==='q'){
                    if(!event.repeat&&(key==='e'||players===2)){const index=key==='e'?0:1;setGears(old=>old.map((gear,i)=>i===index?-gear:gear) as [Gear,Gear]);}
                }else if(key==='r'||key==='f'){
                    if(!event.repeat&&(key==='r'||players===2)){const index=key==='r'?0:1;worldRef.current=recoverPlayer(worldRef.current,index,track,'manual',players);setWorld(worldRef.current);setGap(null);}
                }else keys.current.add(key);
            }
        }
        const up=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase());
        const blur=()=>{keys.current.clear();setRunning(false);};
        const visibility=()=>{if(document.hidden)blur();};
        window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
        return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);keys.current.clear();};
    },[track,players]);

    useEffect(()=>{
        let active=true,animation=0,scene:ReturnType<typeof import('../lib/race-3d').createRaceScene>|undefined;
        const node=canvas.current;if(!node)return;
        const stacked=window.matchMedia('(max-width:700px)');
        const lost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(animation);setReady(false);setRunning(false);setError('La vista 3D se ha interrumpido. Reintenta conservando la carrera.');};
        node.addEventListener('webglcontextlost',lost);
        import('../lib/race-3d').then(module=>{
            if(!active)return;
            scene=module.createRaceScene(node,track,{players});setReady(true);
            let previous=performance.now(),published=previous,accumulator=0;
            const draw=(now:number)=>{
                if(!active)return;
                const delta=Math.min(.1,Math.max(0,(now-previous)/1000));previous=now;
                const options=settings.current;
                if(options.running){
                    const starting=countdownRef.current>0;
                    if(starting){countdownRef.current=advanceStartLights(countdownRef.current,delta);accumulator=0;}
                    else accumulator+=delta;
                    while(accumulator>=FIXED_STEP){
                        const first=options.mode==='wheel'?readWheelInput(options.inverted).input:keyboardDrivingInput(keys.current,'arrows');
                        const second=keyboardDrivingInput(keys.current,'wasd');
                        worldRef.current=stepPlayerWorld(worldRef.current,[{...first,gear:options.gears[0]},{...second,gear:options.gears[1]}],FIXED_STEP,track,{players,resetAtTrackEdge:true});accumulator-=FIXED_STEP;
                    }
                }else accumulator=0;
                if(now-published>=80){setCountdown(countdownRef.current);setWorld(worldRef.current);setGap(players===2?gapTracker.current.record(worldRef.current):null);if(options.mode==='wheel')setWheelName(readWheelInput(options.inverted).name);published=now;}
                try{if(options.camera==='split'||options.camera==='split-cockpit')scene!.renderSplit(worldRef.current,delta,stacked.matches,options.camera==='split-cockpit');else scene!.render(worldRef.current,options.camera,delta);}catch{setError('No se pudo dibujar la vista 3D. Reintenta la vista para continuar.');setReady(false);setRunning(false);return;}
                animation=requestAnimationFrame(draw);
            };
            animation=requestAnimationFrame(draw);
        }).catch(()=>{if(active){setReady(false);setRunning(false);setError('No se pudo iniciar la vista 3D. Comprueba que WebGL esté disponible y reintenta.');}});
        return()=>{active=false;cancelAnimationFrame(animation);node.removeEventListener('webglcontextlost',lost);scene?.dispose();};
    },[track,retry,players]);

    function chooseControl(next:ControlMode){for(const key of ['arrowup','arrowdown','arrowleft','arrowright',' '])keys.current.delete(key);setMode(next);}
    function chooseGear(index:0|1,gear:Gear){setGears(old=>old.map((current,i)=>i===index?gear:current) as [Gear,Gear]);}
    function reset(){countdownRef.current=START_LIGHT_SECONDS;setCountdown(START_LIGHT_SECONDS);setRunning(true);keys.current.clear();gapTracker.current.clear();setGap(null);setGears([1,1]);const initial=createPlayerWorld(track);worldRef.current=initial;setWorld(initial);}
    function recover(index:0|1){worldRef.current=recoverPlayer(worldRef.current,index,track,'manual',players);setWorld(worldRef.current);setGap(null);}
    function pause(){keys.current.clear();setRunning(v=>!v);}
    async function toggleFullscreen(){try{if(document.fullscreenElement===stage.current)await document.exitFullscreen();else await stage.current?.requestFullscreen();setFullscreenError('');}catch{setFullscreenError('Este navegador no ha permitido la pantalla completa. Puedes ampliarlo con F11.');}}
    const cameras:{id:SimulatorView;label:string}[]=players===2?[{id:'split',label:'Pantalla dividida'},{id:'split-cockpit',label:'Primera persona · los dos'},{id:'duel',label:'Vista conjunta'},{id:'aerial',label:'Vista aérea'}]:[{id:'player',label:'Seguir coche'},{id:'car-1',label:'Primera persona'},{id:'aerial',label:'Vista aérea'}];
    const activeCars=world.cars.slice(0,players),split=camera==='split'||camera==='split-cockpit';
    const lights=startLightCount(countdown),starting=countdown>0;
    const gapText=gap?gap.seconds<.005?'En paralelo':`J${gap.leader+1} delante · +${gap.seconds.toFixed(2)} s`:'Esperando referencia común';

    return <>
        {error&&<div className="notice" role="alert">{error}<button type="button" onClick={()=>{setError('');setRetry(v=>v+1);}}>Reintentar 3D</button></div>}
        <section className={`panel simulator-game simulator-stage${fullscreen?' is-fullscreen':''}`} ref={stage} aria-label={`Simulador Greenpower para ${players} ${players===1?'jugador':'jugadores'}`}>
            <div className="simulator-display-toolbar"><div className="simulator-camera-tabs" role="group" aria-label="Vista del simulador">{cameras.map(option=><button type="button" key={option.id} aria-pressed={camera===option.id} onClick={()=>setCamera(option.id)}>{option.label}</button>)}</div><div className="simulator-stage-actions"><button type="button" className="secondary" disabled={!ready} onClick={pause}>{running?<Pause size={16}/>:<Play size={16}/>} {running?'Pausar':'Continuar'}</button><button type="button" className="secondary" onClick={reset}><RotateCcw size={16}/>Reiniciar</button><button type="button" className="secondary" onClick={toggleFullscreen}>{fullscreen?<Minimize size={16}/>:<Expand size={16}/>} {fullscreen?'Salir de pantalla completa':'Pantalla completa'}</button></div></div>
            {fullscreenError&&<p className="simulator-fullscreen-error" role="status">{fullscreenError}</p>}
            <div className={`simulator-screen simulator-timed-screen${split?' is-split':''}`} data-renderer={ready?'ready':error?'error':'loading'} data-view={camera} data-players={players} data-start={starting?'countdown':'racing'} data-countdown={countdown}>
                <canvas key={retry} ref={canvas} tabIndex={0} aria-label={players===2?'Dos cámaras: izquierda o arriba sigue a J1; derecha o abajo sigue a J2.':'Cámara del jugador 1.'}/>
                <div className={`simulator-viewport-overlays${split?' is-split':''}`}>{activeCars.map((car,index)=><section key={car.id} className={`simulator-viewport-overlay player-${index+1}`} data-camera-player={index+1} aria-label={`Pantalla del jugador ${index+1}`}><div className="simulator-viewport-hud"><div className="simulator-viewport-heading"><strong>J{index+1} · {index?'NEGRO / ROJO':'BLANCO'}</strong><span>{(car.speed*3.6).toFixed(1)} km/h · <b>{gears[index]===1?'D':'R'}</b></span></div><div className="simulator-viewport-clocks"><div><span>Vuelta actual{car.lapInvalid?' · no válida':''}</span><strong data-lap-current={index+1}>{lapTime(world.elapsed-car.lapStarted)}</strong></div><div><span>Mejor vuelta</span><strong data-lap-best={index+1}>{lapTime(car.bestLap)}</strong></div></div><div className="simulator-viewport-bottom"><span>Vuelta {(car.lapCount??0)+1}</span><GearControls index={index as 0|1} gear={gears[index]} choose={gear=>chooseGear(index as 0|1,gear)} compact/></div></div>{(car.penaltyRemaining??0)>0&&<p className="simulator-edge-reset" data-penalty={index+1} role="status">Fuera de pista · penalización 2 s<br/>Recolocación en {car.penaltyRemaining!.toFixed(1)} s</p>}{(car.resetNoticeSeconds??0)>0&&<p className="simulator-edge-reset" role="status">Penalización cumplida · J{index+1} recolocado</p>}</section>)}</div>
                <div className="simulator-race-timing"><span>Carrera {lapTime(world.elapsed)}</span>{players===2&&<strong data-time-gap={gap?.seconds??''} title="Tiempo entre los coches al pasar por el mismo punto del circuito">{gapText}</strong>}</div>
                {ready&&(starting||world.elapsed<1)&&<div className={`simulator-start-lights${starting?'':' is-go'}`} role="status" aria-label={starting?`Salida en ${Math.ceil(countdown)} segundos`:'¡Salida!'} data-start-lights={lights}><div className="simulator-light-bar">{[0,1,2,3,4].map(light=><span key={light} className={light<lights?'lit':''}/>)}</div><strong>{starting?`Salida en ${Math.ceil(countdown)} s`:'¡SALIDA!'}</strong></div>}
                {!ready&&!error&&<div className="simulator-loading" role="status">Preparando la pista…</div>}{ready&&!running&&<div className="simulator-paused">PAUSA</div>}
            </div>
            <div className="simulator-dashboard"><div className="simulator-controls"><div className="simulator-control-modes" role="group" aria-label="Control del jugador 1"><button type="button" aria-pressed={mode==='keyboard'} className={mode==='keyboard'?'selected':''} onClick={()=>chooseControl('keyboard')}><Keyboard size={16}/>J1 · Flechas</button><button type="button" aria-pressed={mode==='wheel'} className={mode==='wheel'?'selected':''} onClick={()=>chooseControl('wheel')}><Gamepad2 size={16}/>J1 · Volante / Gamepad</button></div>{mode==='wheel'&&<div className="simulator-wheel-settings"><p>{wheelName?`Detectado: ${wheelName}`:'Conecta el volante y pulsa un botón para detectarlo.'}</p><label><input type="checkbox" checked={inverted} onChange={e=>setInverted(e.target.checked)}/>Invertir eje del volante</label></div>}<p className="simulator-control-hint">J1: flechas · E cambia D/R · R recoloca.{players===2&&' J2: WASD · Q cambia D/R · F recoloca.'}<span>Selecciona R y acelera para retroceder. ↓ / S frenan en ambas marchas. Las cuatro ruedas fuera del margen: parada de 2 s y recolocación individual.</span></p></div></div>
        </section>
        <div className={`simulator-player-panels${players===1?' single-player':''}`}>{activeCars.map((car,index)=><PlayerPanel key={car.id} car={car} index={index as 0|1} elapsed={world.elapsed} gear={gears[index]} chooseGear={gear=>chooseGear(index as 0|1,gear)} recover={()=>recover(index as 0|1)}/>)}</div>
        <p className="race-media-note">Se permite pisar el piano: las cuatro ruedas deben superar el borde del asfalto más 1 m para recibir una parada de 2 segundos antes de recolocar ese coche. La vuelta queda anulada. El mejor tiempo anterior se conserva. La diferencia de tiempo compara el paso por el mismo punto y aparece cuando hay una referencia válida. 35 km/h en llano y marcha atrás hasta 8 km/h.</p>
    </>;
}

function GearControls({index,gear,choose,compact=false}:{index:0|1;gear:Gear;choose:(gear:Gear)=>void;compact?:boolean}){
    return <div className={`simulator-gear-controls${compact?' compact':''}`} role="group" aria-label={`Marcha J${index+1}`}><button type="button" aria-pressed={gear===1} aria-label={`Avance J${index+1}${compact?' en cámara':''}`} onClick={()=>choose(1)}>D{!compact&&' · Avance'}</button><button type="button" aria-pressed={gear===-1} aria-label={`Marcha atrás J${index+1}${compact?' en cámara':''}`} onClick={()=>choose(-1)}>R{!compact&&' · Atrás'}</button></div>;
}

function PlayerPanel({car,index,elapsed,gear,chooseGear,recover}:{car:RaceVehicle;index:0|1;elapsed:number;gear:Gear;chooseGear:(gear:Gear)=>void;recover:()=>void}){
    const impact=(car.impactSeconds??0)>0;
    const status=(car.penaltyRemaining??0)>0?`Penalización 2 s · recolocación en ${car.penaltyRemaining!.toFixed(1)} s`:(car.resetNoticeSeconds??0)>0?'Límite del asfalto superado · coche recolocado':car.gearSwitching?'Frenando antes de invertir la marcha':impact?`Choque con ${car.impactType==='coche'?'el otro coche':'la valla'}`:(car.slip??0)>.2?'Subviraje · frena para girar':car.lapInvalid?'Vuelta no válida · continúa hasta meta':'En pista';
    return <section className={`panel simulator-player-panel${impact?' has-impact':''}`} data-player={index+1} data-world-x={car.worldX} data-world-z={car.worldZ} data-heading={car.worldHeading} data-speed={car.speed} data-collisions={car.collisionCount??0} data-resets={car.trackResets??0} data-gear={gear} data-penalty={car.penaltyRemaining??0} data-penalty-total={car.penaltyTotal??0} aria-label={`Datos del jugador ${index+1}`}>
        <div className="panel-heading"><div><h2><span className={`race-car-swatch car-${index+1}`}/>Jugador {index+1} · {index?'Negro y rojo':'Blanco'}</h2><p>{index?'WASD · Q cambia marcha':'Flechas o volante · E cambia marcha'} · vuelta {(car.lapCount??0)+1}</p></div><strong className="simulator-panel-speed">{(car.speed*3.6).toFixed(1)} <small>km/h · {gear===1?'D':'R'}</small></strong></div><p className="simulator-contact-status" role="status">{status}</p>
        <div className="simulator-player-timing"><div><span>Vuelta actual{car.lapInvalid?' · no válida':''}</span><strong>{lapTime(elapsed-car.lapStarted)}</strong></div><div><span>Última vuelta</span><strong>{lapTime(car.lastLap)}</strong></div><div><span>Mejor vuelta</span><strong>{lapTime(car.bestLap)}</strong></div></div>
        <div className="simulator-player-gears"><GearControls index={index} gear={gear} choose={chooseGear}/><span>{car.trackResets??0} salidas · {car.penaltyTotal??0} s de penalización</span></div>
        <div className="simulator-recover"><span>{car.collisionCount??0} contactos registrados</span><button type="button" className="secondary" disabled={(car.penaltyRemaining??0)>0} onClick={recover}>Recolocar J{index+1} · {index?'F':'R'}</button></div>
    </section>;
}
