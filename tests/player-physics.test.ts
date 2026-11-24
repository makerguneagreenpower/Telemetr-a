import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitRuntime, type CircuitRuntime } from '../lib/circuits';
import { createPlayerWorld, keyboardDrivingInput, stepPlayerCar, stepPlayerWorld, recoverPlayer, PLAYER_SPEED_LIMIT, FIXED_STEP, type RaceVehicle, type RaceWorld } from '../lib/race-engine';
import { locateOnCircuit, BARRIER_CLEARANCE, CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../lib/driving-physics';

const flat=createCircuitRuntime({version:1,id:'flat',name:'Flat',competition:'',source:'map',width:8.2,updatedAt:'test',vertices:[{x:0,z:0},{x:2000,z:0},{x:2000,z:500},{x:0,z:500}]});
const coast={throttle:0,brake:0,steering:0};
const gas={throttle:1,brake:0,steering:0};
function carAt(distance:number,lane=0,speed=0,index:0|1=0,heading?:number,track=flat):RaceVehicle {
    const original=createPlayerWorld(track).cars[index],p=track.point(distance/track.length),h=heading??p.heading;
    return {...original,distance,routeProgress:distance/track.length,lapCount:0,worldX:p.x+Math.cos(p.heading)*lane,worldZ:p.z-Math.sin(p.heading)*lane,worldHeading:h,worldVX:Math.sin(h)*speed,worldVZ:Math.cos(h)*speed,speed,lane};
}
function drive(car:RaceVehicle,seconds:number,input=gas,track=flat){for(let i=0;i<Math.round(seconds/FIXED_STEP);i++)car=stepPlayerCar(car,input,FIXED_STEP,track,(i+1)*FIXED_STEP);return car;}
function onGrade(grade:number):CircuitRuntime{return {...flat,point:p=>({...flat.point(p),grade})};}
const headingChange=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

test('flechas y WASD controlan jugadores distintos con dirección izquierda negativa',()=>{
    const keys=new Set(['arrowup','arrowleft','w','d']);
    assert.deepEqual(keyboardDrivingInput(keys,'arrows'),{throttle:1,brake:0,steering:-1});
    assert.deepEqual(keyboardDrivingInput(keys,'wasd'),{throttle:1,brake:0,steering:1});
    assert.equal(keyboardDrivingInput(new Set(['w']),'arrows').throttle,0);
    assert.equal(keyboardDrivingInput(new Set(['arrowup']),'wasd').throttle,0);
    assert.equal(keyboardDrivingInput(new Set([' ']),'wasd').brake,0);
    assert.equal(keyboardDrivingInput(new Set([' ']),'arrows').brake,1);
});

test('girar izquierda/derecha mueve el coche al lado correcto de su orientación',()=>{
    for(const sign of [-1,1]){
        const original=carAt(400,0,4),next=drive(original,.5,{throttle:0,brake:0,steering:sign});
        assert.equal(Math.sign(headingChange(next.worldHeading!,original.worldHeading!)),-sign);
        const h=original.worldHeading!,side=(next.worldX!-original.worldX!)*Math.cos(h)-(next.worldZ!-original.worldZ!)*Math.sin(h);
        assert.equal(Math.sign(side),-sign);
    }
});

test('ambos jugadores aceleran a la vez y frenar uno no frena al otro',()=>{
    let world:RaceWorld={elapsed:0,cars:[carAt(300,-1,6),carAt(300,1,6,1)]};
    for(let i=0;i<60;i++)world=stepPlayerWorld(world,[{throttle:0,brake:1,steering:0},gas],FIXED_STEP,flat);
    assert.ok(world.cars[0].speed<1);assert.ok(world.cars[1].speed>6);
    assert.ok(world.elapsed>.99);assert.ok(world.cars[0].worldX!<world.cars[1].worldX!);
});

test('el motor no supera 35 km/h en una recta llana',()=>{
    let car=carAt(100);
    for(let i=0;i<60*100;i++){car=stepPlayerCar(car,gas,FIXED_STEP,flat,i*FIXED_STEP);assert.ok(car.speed<=PLAYER_SPEED_LIMIT+1e-8);}
    assert.ok(car.speed*3.6>34.5);
});

test('sin acelerar la bajada supera 35 km/h y la subida pierde velocidad',()=>{
    const initial=carAt(400,0,PLAYER_SPEED_LIMIT);
    const down=drive(initial,3,coast,onGrade(-.10)),up=drive(initial,3,coast,onGrade(.10)),level=drive(initial,3,coast);
    assert.ok(down.speed>PLAYER_SPEED_LIMIT+.5);assert.ok(up.speed<level.speed);assert.ok(level.speed<initial.speed);
});

test('el freno detiene ambos coches sin hacerlos retroceder',()=>{
    const stopped=drive(carAt(400,0,9),3,{throttle:0,brake:1,steering:0});assert.equal(stopped.speed,0);
});

test('a velocidad alta la curva se abre; al frenar se recupera el giro cerrado',()=>{
    const slow=carAt(400,0,3),fast=carAt(400,0,9);
    const turn={throttle:0,brake:0,steering:1};
    const low=drive(slow,.4,turn),high=drive(fast,.4,turn);
    const lowCurve=Math.abs(headingChange(low.worldHeading!,slow.worldHeading!))/(low.wheelTravel!-slow.distance);
    const highCurve=Math.abs(headingChange(high.worldHeading!,fast.worldHeading!))/(high.wheelTravel!-fast.distance);
    assert.ok(highCurve<lowCurve);assert.ok((high.slip??0)>.2);assert.equal(low.slip,0);
    const braked=drive(fast,1,{throttle:0,brake:1,steering:0});
    assert.ok(braked.speed<4);assert.equal(drive(braked,.4,turn).slip,0);
});

test('los pianos producen bote, más resistencia y menos agarre',()=>{
    const edge=flat.width/2-.1;
    const curb=drive(carAt(400,edge,7),.1,coast),asphalt=drive(carAt(400,0,7),.1,coast);
    assert.equal(curb.onCurb,true);assert.equal(asphalt.onCurb,false);assert.ok(curb.speed<asphalt.speed);assert.ok(Math.abs(curb.curbBounce??0)>1e-6);
});

test('los coches no atraviesan las vallas incluso a alta velocidad',()=>{
    for(const sign of [-1,1]){
        const point=flat.point(400/flat.length),barrier=flat.width/2+BARRIER_CLEARANCE;
        let car=carAt(400,sign*(barrier-2),20,0,point.heading+sign*Math.PI/2);
        for(let i=0;i<60;i++){
            car=stepPlayerCar(car,gas,FIXED_STEP,flat,i*FIXED_STEP);
            const surface=locateOnCircuit(car.worldX!,car.worldZ!,flat,car.routeProgress);
            const h=car.worldHeading!,delta=h-surface.heading,extent=Math.abs(Math.sin(delta))*CAR_HALF_LENGTH+Math.abs(Math.cos(delta))*CAR_HALF_WIDTH;
            assert.ok(surface.distance+extent<=barrier+.03);
        }
        assert.ok((car.collisionCount??0)>0);
    }
});

test('un alcance empuja al otro coche y conserva el orden de sus centros',()=>{
    let world:RaceWorld={elapsed:0,cars:[carAt(300,0,9),carAt(305,0,0,1)]};
    for(let i=0;i<60;i++){world=stepPlayerWorld(world,[coast,coast],FIXED_STEP,flat);assert.ok(world.cars[0].worldX!<world.cars[1].worldX!);}
    assert.ok((world.cars[0].collisionCount??0)>0);assert.ok((world.cars[1].collisionCount??0)>0);assert.ok(world.cars[1].speed>0);
});

test('los impactos de frente no permiten que los coches se atraviesen',()=>{
    const heading=flat.point(300/flat.length).heading;
    let world:RaceWorld={elapsed:0,cars:[carAt(300,0,12),carAt(305,0,12,1,heading+Math.PI)]};
    for(let i=0;i<60;i++){world=stepPlayerWorld(world,[coast,coast],FIXED_STEP,flat);assert.ok(world.cars[0].worldX!<world.cars[1].worldX!);}
    assert.ok((world.cars[0].collisionCount??0)>0);
    for(const car of world.cars)assert.ok(Object.values(car).filter(v=>typeof v==='number').every(Number.isFinite));
});

test('los coches inicialmente solapados se separan sin introducir energía',()=>{
    const world=stepPlayerWorld({elapsed:0,cars:[carAt(300,-.4),carAt(300,.4,0,1)]},[coast,coast],FIXED_STEP,flat);
    assert.ok(Math.abs(world.cars[0].worldZ!-world.cars[1].worldZ!)>=CAR_HALF_WIDTH*2-.001);
    assert.equal(world.cars[0].speed,0);assert.equal(world.cars[1].speed,0);
});

test('un contacto con la valla no reinicia la carrera ni al otro jugador',()=>{
    const p=flat.point(300/flat.length),barrier=flat.width/2+BARRIER_CLEARANCE;
    let world:RaceWorld={elapsed:15,cars:[carAt(300,barrier-2,7,0,p.heading+Math.PI/2),carAt(1000,0,7,1)]};
    for(let i=0;i<60*7;i++)world=stepPlayerWorld(world,[gas,gas],FIXED_STEP,flat);
    assert.ok(world.elapsed>21.9);assert.ok(world.cars[1].distance>1000);assert.ok((world.cars[0].collisionCount??0)>0);
});

test('recolocar un jugador conserva el reloj y el estado del otro coche',()=>{
    const world:RaceWorld={elapsed:45,cars:[carAt(300,0,7),carAt(301,0,5,1)]};
    const result=recoverPlayer(world,0,flat);
    assert.equal(result.elapsed,45);assert.equal(result.cars[1],world.cars[1]);assert.equal(result.cars[0].speed,0);
    assert.ok(Math.hypot(result.cars[0].worldX!-result.cars[1].worldX!,result.cars[0].worldZ!-result.cars[1].worldZ!)>5);
});

test('cruzar meta cuenta una vuelta y reinicia solo su consumo por vuelta',()=>{
    let car={...carAt(flat.length-.3,0,8),lapStarted:2,consumptionWh:1};
    for(let i=1;i<=10;i++)car=stepPlayerCar(car,gas,FIXED_STEP,flat,10+i*FIXED_STEP) as typeof car;
    assert.notEqual(car.lastLap,null);assert.equal(car.bestLap,car.lastLap);assert.ok(car.lastLapWh!>=1);assert.ok(car.consumptionWh<car.lastLapWh!);assert.equal(car.lapCount,1);
});


test('el freno también detiene un retroceso causado por un impacto sin cambiar su sentido',()=>{
    const car=carAt(400,0,1),f=flat.point(400/flat.length);
    car.worldVX=-Math.sin(f.heading);car.worldVZ=-Math.cos(f.heading);
    const stopped=drive(car,1,{throttle:0,brake:1,steering:0});
    assert.ok(stopped.speed<1e-8);
});
