import {advanceStartLights,startLightCount,START_LIGHT_SECONDS} from '../lib/simulator-start';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCircuitRuntime} from '../lib/circuits';
import {createPlayerWorld,stepPlayerWorld,stepPlayerCar,recoverPlayer,FIXED_STEP,type RaceVehicle,type RaceWorld,type DrivingInput} from '../lib/race-engine';
import {outsideAsphalt,WHEEL_LATERAL_OFFSET,REVERSE_SPEED_LIMIT,TRACK_EXIT_MARGIN,TRACK_EXIT_PENALTY} from '../lib/driving-physics';
import {createPlayerGapTracker} from '../lib/simulator-timing';

const track=createCircuitRuntime({version:1,id:'modes',name:'Modes',competition:'',source:'map',width:8.2,updatedAt:'t',vertices:[{x:0,z:0},{x:2000,z:0},{x:2000,z:500},{x:0,z:500}]});
const idle={throttle:0,brake:0,steering:0},gas={throttle:1,brake:0,steering:0};
function carAt(distance:number,lane=0,speed=0,index:0|1=0):RaceVehicle{
    const original=createPlayerWorld(track).cars[index],p=track.point(distance/track.length);
    return {...original,distance,routeProgress:((distance/track.length)%1+1)%1,lapCount:0,worldX:p.x+Math.cos(p.heading)*lane,worldZ:p.z-Math.sin(p.heading)*lane,worldHeading:p.heading,worldVX:Math.sin(p.heading)*speed,worldVZ:Math.cos(p.heading)*speed,speed,lane};
}
function drive(car:RaceVehicle,seconds:number,input:DrivingInput=gas){for(let i=0;i<Math.round(seconds/FIXED_STEP);i++)car=stepPlayerCar(car,input,FIXED_STEP,track,10+(i+1)*FIXED_STEP);return car;}

test('solo las cuatro ruedas fuera del margen exterior activan la salida',()=>{
    const line=track.width/2+TRACK_EXIT_MARGIN+WHEEL_LATERAL_OFFSET;
    assert.equal(outsideAsphalt(carAt(400,track.width/2),track),false);
    assert.equal(outsideAsphalt(carAt(400,line-.01),track),false);
    assert.equal(outsideAsphalt(carAt(400,line+.01),track),true);
    assert.equal(outsideAsphalt(carAt(400,-line+.01),track),false);
    assert.equal(outsideAsphalt(carAt(400,-line-.01),track),true);
    const angled={...carAt(400,line+.2),worldHeading:track.point(400/track.length).heading+Math.PI/2};
    assert.equal(outsideAsphalt(angled,track),false,'una rueda aún dentro impide la penalización aunque el centro esté fuera');
});

test('salir inmoviliza dos segundos antes de recolocar solo ese coche',()=>{
    const initial:RaceWorld={elapsed:10,cars:[{...carAt(400,track.width/2+TRACK_EXIT_MARGIN+WHEEL_LATERAL_OFFSET+.1),bestLap:42,lastLap:45},carAt(800,0,5,1)]};
    let next=stepPlayerWorld(initial,[gas,gas],FIXED_STEP,track,{players:2,resetAtTrackEdge:true});
    assert.ok(next.cars[0].penaltyRemaining!>1.9);assert.equal(next.cars[0].penaltyTotal,2);assert.equal(next.cars[0].speed,0);assert.equal(next.cars[0].trackResets,undefined);
    assert.equal(recoverPlayer(next,0,track),next,'recolocar manualmente no permite saltarse la sanción');
    const position=[next.cars[0].worldX,next.cars[0].worldZ];
    for(let i=0;i<Math.round(1.8/FIXED_STEP);i++)next=stepPlayerWorld(next,[gas,gas],FIXED_STEP,track,{players:2,resetAtTrackEdge:true});
    assert.deepEqual([next.cars[0].worldX,next.cars[0].worldZ],position);assert.equal(next.cars[0].trackResets,undefined);
    for(let i=0;i<Math.round(.3/FIXED_STEP);i++)next=stepPlayerWorld(next,[idle,gas],FIXED_STEP,track,{players:2,resetAtTrackEdge:true});
    assert.equal(next.cars[0].trackResets,1);assert.equal(next.cars[0].penaltyRemaining,0);assert.equal(next.cars[0].lapInvalid,true);assert.equal(next.cars[0].bestLap,42);assert.equal(next.cars[0].lastLap,45);
    assert.ok(next.elapsed>12);assert.ok(next.cars[0].lapStarted>=12);assert.equal(outsideAsphalt(next.cars[0],track),false);
    assert.equal(next.cars[1].repositionCount,undefined);assert.ok(next.cars[1].distance>810);
    assert.equal(TRACK_EXIT_PENALTY,2);
});

test('con un jugador el segundo no se mueve ni participa en choques',()=>{
    const first=carAt(400),ghost=carAt(400,0,7,1);
    const next=stepPlayerWorld({elapsed:0,cars:[first,ghost]},[gas,gas],FIXED_STEP,track,{players:1,resetAtTrackEdge:true});
    assert.equal(next.cars[1],ghost);assert.ok(next.cars[0].speed>0);assert.equal(next.cars[0].collisionCount,undefined);assert.ok(next.cars[0].distance>400);
});

test('recolocar en modo individual ignora el coche inactivo',()=>{
    const world:RaceWorld={elapsed:10,cars:[carAt(400),carAt(400,0,0,1)]};
    const next=recoverPlayer(world,0,track,'manual',1);
    assert.equal(next.cars[0].routeProgress,world.cars[0].routeProgress);assert.equal(next.cars[1],world.cars[1]);
});

test('la marcha R retrocede con el acelerador y está limitada a 8 km/h',()=>{
    const original=carAt(400),next=drive(original,6,{...gas,gear:-1});
    assert.equal(next.gear,-1);assert.ok(next.distance<original.distance);assert.ok(next.wheelTravel!<original.distance);assert.ok(next.speed>.5);assert.ok(next.speed<=REVERSE_SPEED_LIMIT+1e-8);
});

test('cambiar entre D y R frena antes de invertir el movimiento',()=>{
    const original=carAt(400,0,6);
    const first=stepPlayerCar(original,{...gas,gear:-1},FIXED_STEP,track,1);
    assert.ok(first.worldVX!>0);assert.ok(first.speed<original.speed);assert.equal(first.gearSwitching,true);
    const reversed=drive(original,3,{...gas,gear:-1});assert.ok(reversed.worldVX!<0);
    const forward=drive(reversed,3,{...gas,gear:1});assert.ok(forward.worldVX!>0);
});

test('el freno detiene la marcha atrás sin empujar hacia delante',()=>{
    const reversing=drive(carAt(400),2,{...gas,gear:-1});
    const stopped=drive(reversing,2,{throttle:0,brake:1,steering:0,gear:-1});
    assert.equal(stopped.speed,0);
});

test('cruzar la meta hacia atrás no suma vueltas ni crea un mejor tiempo',()=>{
    const reversed=drive(carAt(.2),2,{...gas,gear:-1});
    assert.equal(reversed.lapCount,0);assert.equal(reversed.bestLap,null);assert.equal(reversed.lastLap,null);
});

test('la primera meta después de recolocar empieza una vuelta válida sin registrar un recorte',()=>{
    let car:RaceVehicle={...carAt(track.length-.2,0,8),lapInvalid:true,lapTravel:track.length-.2,lapStarted:2,bestLap:42,lastLap:45};
    car=drive(car,.2);
    assert.equal(car.lapInvalid,false);assert.equal(car.bestLap,42);assert.equal(car.lastLap,45);assert.equal(car.lapCount,0);assert.ok(car.lapStarted>=10);
});

test('la diferencia compara pasos reales por el mismo punto',()=>{
    const tracker=createPlayerGapTracker();let gap:ReturnType<typeof tracker.record>=null;
    for(let t=0;t<=10;t++)gap=tracker.record({elapsed:t,cars:[carAt(t*10),carAt(t*8,0,99,1)]});
    assert.ok(gap);assert.equal(gap.leader,0);assert.ok(Math.abs(gap.seconds-2)<1e-8);
});

test('la diferencia cambia de líder al adelantar y se congela en pausa',()=>{
    const tracker=createPlayerGapTracker();
    for(let t=0;t<=10;t++)tracker.record({elapsed:t,cars:[carAt(t*10),carAt(t*8,0,0,1)]});
    const world:RaceWorld={elapsed:11,cars:[carAt(100),carAt(110,0,0,1)]};
    const gap=tracker.record(world);assert.ok(gap);assert.equal(gap.leader,1);assert.ok(Math.abs(gap.seconds-1/3)<1e-8);assert.deepEqual(tracker.record(world),gap);
});

test('no se inventa una diferencia antes de tener referencia o después de recolocar',()=>{
    const tracker=createPlayerGapTracker();
    assert.equal(tracker.record({elapsed:0,cars:[carAt(10),carAt(0,0,0,1)]}),null);
    for(let t=1;t<=10;t++)tracker.record({elapsed:t,cars:[carAt(10+t*10),carAt(t*8,0,0,1)]});
    assert.equal(tracker.record({elapsed:11,cars:[{...carAt(20),repositionCount:1},carAt(88,0,0,1)]}),null);
});


test('la dirección corresponde a izquierda y derecha en la cámara y se invierte naturalmente al retroceder',()=>{
    for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const steering of [-1,1]){
        const original={...carAt(400),worldHeading:heading,worldVX:Math.sin(heading)*3,worldVZ:Math.cos(heading)*3,speed:3};
        const next=drive(original,.4,{throttle:0,brake:0,steering});
        // Camera looks along the car's +Z direction; screen-right = forward × up.
        const screenSide=(next.worldX!-original.worldX!)*-Math.cos(heading)+(next.worldZ!-original.worldZ!)*Math.sin(heading);
        assert.equal(Math.sign(screenSide),steering);
        const reversing={...original,worldVX:-Math.sin(heading)*3,worldVZ:-Math.cos(heading)*3};
        const back=drive(reversing,.4,{throttle:0,brake:0,steering,gear:-1});
        const yaw=Math.atan2(Math.sin(back.worldHeading!-heading),Math.cos(back.worldHeading!-heading));
        assert.equal(Math.sign(yaw),steering);
    }
});


test('el semáforo enciende cinco luces secuenciales y se apaga tras cinco segundos',()=>{
    let remaining=START_LIGHT_SECONDS;assert.equal(startLightCount(remaining),1);
    for(let second=1;second<=5;second++){
        for(let frame=0;frame<60;frame++)remaining=advanceStartLights(remaining,1/60);
        if(second<5)assert.equal(startLightCount(remaining),second+1);
    }
    assert.ok(remaining<1e-8);assert.equal(startLightCount(0),0);
    assert.equal(advanceStartLights(3,0),3);assert.equal(advanceStartLights(3,-1),3);
    assert.equal(advanceStartLights(3,5),2.9,'un salto del reloj no omite la salida');
});
