import { DEMO_TRACK, type CircuitRuntime } from './circuits';
import type { DrivingInput, RaceVehicle, RaceWorld } from './race-engine';

// All distances are metres, speeds m/s, angles radians; positive input steers right; positive world yaw turns left in the forward camera.
export const PLAYER_SPEED_LIMIT = 35 / 3.6;
export const REVERSE_SPEED_LIMIT = 8 / 3.6;
export const WHEEL_LATERAL_OFFSET = .64;
export const TRACK_EXIT_MARGIN = 1;
export const TRACK_EXIT_PENALTY = 2;
export type PlayerWorldOptions = { players?:1|2; resetAtTrackEdge?:boolean };
export const CAR_HALF_LENGTH = 1.75;
export const CAR_HALF_WIDTH = .70;
export const BARRIER_CLEARANCE = 4;
const MASS = 108, INERTIA = MASS * ((CAR_HALF_LENGTH * 2) ** 2 + (CAR_HALF_WIDTH * 2) ** 2) / 12;
const G = 9.81, WHEELBASE = 2.1, SUBSTEP = 1 / 120;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
type Vector = { x: number; z: number };
const dot = (a: Vector, b: Vector) => a.x * b.x + a.z * b.z;
const cross = (a: Vector, b: Vector) => a.z * b.x - a.x * b.z;
const forward = (heading: number): Vector => ({ x: Math.sin(heading), z: Math.cos(heading) });
const right = (heading: number): Vector => ({ x: Math.cos(heading), z: -Math.sin(heading) });

function pose(car: RaceVehicle, track: CircuitRuntime) {
    const p = track.point(car.routeProgress ?? car.distance / track.length);
    return { x: car.worldX ?? p.x + Math.cos(p.heading) * car.lane, z: car.worldZ ?? p.z - Math.sin(p.heading) * car.lane, heading: car.worldHeading ?? p.heading };
}

export function locateOnCircuit(x: number, z: number, track: CircuitRuntime, previousProgress?: number) {
    let best = Infinity, result = { x: 0, z: 0, progress: 0, heading: 0, lateral: 0, distance: Infinity };
    const scan = (local: boolean) => {
        for (let i = 1; i < track.outline.length; i++) {
            const a = track.outline[i - 1], b = track.outline[i], progress = (i - 1) / (track.outline.length - 1);
            if (local && previousProgress !== undefined) { const delta = Math.abs(progress - previousProgress); if (Math.min(delta, 1 - delta) * track.length > 40) continue; }
            const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
            const px = a.x + dx * t, pz = a.z + dz * t, distanceSquared = (x - px) ** 2 + (z - pz) ** 2;
            if (distanceSquared >= best) continue;
            best = distanceSquared;
            const heading = Math.atan2(dx, dz), normal = right(heading);
            result = { x: px, z: pz, progress: ((i - 1 + t) / (track.outline.length - 1)) % 1, heading, lateral: (x - px) * normal.x + (z - pz) * normal.z, distance: Math.sqrt(distanceSquared) };
        }
    };
    scan(previousProgress !== undefined);
    if (best > 30 * 30) { best = Infinity; scan(false); }
    return result;
}

function initialize(car: RaceVehicle, track: CircuitRuntime): RaceVehicle {
    const p = pose(car, track), direction = forward(p.heading);
    return { ...car, worldX: p.x, worldZ: p.z, worldHeading: p.heading, worldVX: car.worldVX ?? direction.x * car.speed, worldVZ: car.worldVZ ?? direction.z * car.speed, yawRate: car.yawRate ?? 0, routeProgress: car.routeProgress ?? ((car.distance / track.length) % 1 + 1) % 1 };
}

export function initializePlayerWorld(world: RaceWorld, track: CircuitRuntime): RaceWorld {
    return { ...world, cars: world.cars.map(car => initialize(car, track)) as RaceWorld['cars'] };
}

function contactVelocity(car: RaceVehicle, offset: Vector): Vector {
    return { x: car.worldVX! + car.yawRate! * offset.z, z: car.worldVZ! - car.yawRate! * offset.x };
}
function impulse(car: RaceVehicle, force: Vector, offset: Vector) {
    car.worldVX! += force.x / MASS; car.worldVZ! += force.z / MASS;
    car.yawRate = clamp(car.yawRate! + cross(offset, force) / INERTIA, -3, 3);
    car.speed = Math.hypot(car.worldVX!, car.worldVZ!);
}
function impact(car: RaceVehicle, type: 'valla' | 'coche', strength: number) {
    if (strength < .18) return;
    if ((car.impactSeconds ?? 0) < .1) car.collisionCount = (car.collisionCount ?? 0) + 1;
    car.impactType = type; car.impactSeconds = .75;
}

function resolveBarrier(car: RaceVehicle, track: CircuitRuntime) {
    const surface = locateOnCircuit(car.worldX!, car.worldZ!, track, car.routeProgress);
    const normal = right(surface.heading), sign = surface.lateral >= 0 ? 1 : -1;
    const outward = surface.distance > .001 ? { x:(car.worldX!-surface.x)/surface.distance,z:(car.worldZ!-surface.z)/surface.distance } : { x:normal.x*sign,z:normal.z*sign };
    const f = forward(car.worldHeading!), r = right(car.worldHeading!);
    const front = dot(f, outward), side = dot(r, outward);
    const extent = Math.abs(front) * CAR_HALF_LENGTH + Math.abs(side) * CAR_HALF_WIDTH;
    const penetration = surface.distance + extent - (track.width / 2 + BARRIER_CLEARANCE - .10);
    if (penetration <= 0) return;
    car.worldX! -= outward.x * (penetration + .001); car.worldZ! -= outward.z * (penetration + .001);
    const offset = { x: f.x * Math.sign(front) * CAR_HALF_LENGTH + r.x * Math.sign(side) * CAR_HALF_WIDTH, z: f.z * Math.sign(front) * CAR_HALF_LENGTH + r.z * Math.sign(side) * CAR_HALF_WIDTH };
    const velocity = contactVelocity(car, offset), closing = dot(velocity, outward);
    if (closing > 0) {
        const j = -(1.12 * closing) / (1 / MASS + cross(offset, outward) ** 2 / INERTIA);
        impulse(car, { x: j * outward.x, z: j * outward.z }, offset);
        const tangent = { x: -outward.z, z: outward.x }, tangentSpeed = dot(contactVelocity(car, offset), tangent);
        const friction = clamp(-tangentSpeed / (1 / MASS + cross(offset, tangent) ** 2 / INERTIA), -.4 * Math.abs(j), .4 * Math.abs(j));
        impulse(car, { x: tangent.x * friction, z: tangent.z * friction }, offset);
        impact(car, 'valla', closing);
    }
}

export function resolveCarCollision(a: RaceVehicle, b: RaceVehicle, track: CircuitRuntime) {
    const ay = track.point(a.routeProgress ?? 0).y, by = track.point(b.routeProgress ?? 0).y;
    if (Math.abs(ay - by) > 1.5) return;
    const af = forward(a.worldHeading!), ar = right(a.worldHeading!), bf = forward(b.worldHeading!), br = right(b.worldHeading!);
    const delta = { x: b.worldX! - a.worldX!, z: b.worldZ! - a.worldZ! };
    let penetration = Infinity, normal: Vector = ar;
    for (const axis of [af, ar, bf, br]) {
        const radiusA = Math.abs(dot(af, axis)) * CAR_HALF_LENGTH + Math.abs(dot(ar, axis)) * CAR_HALF_WIDTH;
        const radiusB = Math.abs(dot(bf, axis)) * CAR_HALF_LENGTH + Math.abs(dot(br, axis)) * CAR_HALF_WIDTH;
        const overlap = radiusA + radiusB - Math.abs(dot(delta, axis));
        if (overlap <= 0) return;
        if (overlap < penetration) { penetration = overlap; const sign = dot(delta, axis) >= 0 ? 1 : -1; normal = { x: axis.x * sign, z: axis.z * sign }; }
    }
    a.worldX! -= normal.x * (penetration + .002) / 2; a.worldZ! -= normal.z * (penetration + .002) / 2;
    b.worldX! += normal.x * (penetration + .002) / 2; b.worldZ! += normal.z * (penetration + .002) / 2;
    const support = (f: Vector, r: Vector, direction: Vector): Vector => ({ x: f.x * Math.sign(dot(f, direction)) * CAR_HALF_LENGTH + r.x * Math.sign(dot(r, direction)) * CAR_HALF_WIDTH, z: f.z * Math.sign(dot(f, direction)) * CAR_HALF_LENGTH + r.z * Math.sign(dot(r, direction)) * CAR_HALF_WIDTH });
    const sa = support(af, ar, normal), sb = support(bf, br, { x: -normal.x, z: -normal.z });
    const contact = { x: (a.worldX! + sa.x + b.worldX! + sb.x) / 2, z: (a.worldZ! + sa.z + b.worldZ! + sb.z) / 2 };
    const ra = { x: contact.x - a.worldX!, z: contact.z - a.worldZ! }, rb = { x: contact.x - b.worldX!, z: contact.z - b.worldZ! };
    const va = contactVelocity(a, ra), vb = contactVelocity(b, rb), closing = dot({ x: vb.x - va.x, z: vb.z - va.z }, normal);
    if (closing >= 0) return;
    const denominator = 2 / MASS + (cross(ra, normal) ** 2 + cross(rb, normal) ** 2) / INERTIA;
    const j = -(1.15 * closing) / denominator;
    impulse(a, { x: -normal.x * j, z: -normal.z * j }, ra); impulse(b, { x: normal.x * j, z: normal.z * j }, rb);
    impact(a, 'coche', -closing); impact(b, 'coche', -closing);
}

function integrate(car: RaceVehicle, input: DrivingInput, dt: number, track: CircuitRuntime) {
    const throttle = clamp(input.throttle, 0, 1), brake = clamp(input.brake, 0, 1), steering = clamp(input.steering, -1, 1);
    const surface = locateOnCircuit(car.worldX!, car.worldZ!, track, car.routeProgress), road = track.point(surface.progress);
    const absLane = Math.abs(surface.lateral), onCurb = absLane + CAR_HALF_WIDTH > track.width / 2 && absLane - CAR_HALF_WIDTH < track.width / 2 + .6;
    const onGrass = absLane > track.width / 2 + .6;
    const grip = onGrass ? 1.8 : onCurb ? 3.0 : 5.5;
    const f = forward(car.worldHeading!), r = right(car.worldHeading!), v = { x: car.worldVX!, z: car.worldVZ! };
    const longitudinal = dot(v, f), lateral = dot(v, r);
    const wheelAngle = (car.wheelAngle ?? 0) + (-steering * .48 - (car.wheelAngle ?? 0)) * (1 - Math.exp(-7 * dt));
    const wantedYaw = longitudinal / WHEELBASE * Math.tan(wheelAngle), yawLimit = grip / Math.max(1, Math.abs(longitudinal));
    const yawTarget = clamp(wantedYaw, -yawLimit, yawLimit);
    const yawRate = car.yawRate! + (yawTarget - car.yawRate!) * (1 - Math.exp(-7 * dt));
    const slip = clamp((Math.abs(wantedYaw * longitudinal) - grip) / grip, 0, 1);
    const grade = road.grade * Math.cos(angle(car.worldHeading! - road.heading));
    const gravity = MASS * G * grade / Math.sqrt(1 + road.grade ** 2);
    const drag = Math.abs(longitudinal) > .03 ? Math.sign(longitudinal) * (12 + .18 * longitudinal ** 2 + (onGrass ? 65 : onCurb ? 20 : 0) + slip * 18) : 0;
    const gear=input.gear??1;
    const againstGear=longitudinal*gear<-.12;
    const brakingInput=Math.max(brake,againstGear?throttle:0);
    const driveLimit=gear===1?PLAYER_SPEED_LIMIT:REVERSE_SPEED_LIMIT;
    const engine=car.speed<driveLimit-.001&&!againstGear?throttle*Math.min(300,650*.82/Math.max(1.5,Math.abs(longitudinal))):0;
    const motorForce=engine*gear, braking=brakingInput*MASS*6.5;
    let acceleration=clamp((motorForce-drag-gravity-Math.sign(longitudinal||gear)*braking)/MASS,-8,4);
    if(engine>0 && acceleration*gear>.95)acceleration=gear*Math.max(.95,(-gravity-drag-Math.sign(longitudinal||gear)*braking)/MASS*gear);
    let nextLongitudinal=longitudinal+acceleration*dt;
    if(brakingInput>0 && longitudinal*nextLongitudinal<0)nextLongitudinal=0;
    if(Math.abs(longitudinal)<.0001 && brakingInput>0)nextLongitudinal=0;
    if(gear===1&&longitudinal>=0&&nextLongitudinal<0)nextLongitudinal=0;
    if(gear===-1&&longitudinal<=0&&nextLongitudinal>0)nextLongitudinal=0;
    if(grade>=-.001&&longitudinal<=PLAYER_SPEED_LIMIT)nextLongitudinal=Math.min(nextLongitudinal,PLAYER_SPEED_LIMIT);
    nextLongitudinal=Math.max(-REVERSE_SPEED_LIMIT,nextLongitudinal);
    car.gear=gear;car.gearSwitching=againstGear&&throttle>0;
    const lateralChange = clamp(-lateral, -grip * dt, grip * dt);
    car.worldVX = f.x * nextLongitudinal + r.x * (lateral + lateralChange);
    car.worldVZ = f.z * nextLongitudinal + r.z * (lateral + lateralChange);
    const speed = Math.hypot(car.worldVX,car.worldVZ);
    if (grade >= -.001 && car.speed <= PLAYER_SPEED_LIMIT && speed > PLAYER_SPEED_LIMIT) { car.worldVX *= PLAYER_SPEED_LIMIT/speed;car.worldVZ *= PLAYER_SPEED_LIMIT/speed; }
    car.worldX! += car.worldVX * dt; car.worldZ! += car.worldVZ * dt;
    car.worldHeading = angle(car.worldHeading! + yawRate * dt); car.yawRate = yawRate;
    car.speed = Math.hypot(car.worldVX, car.worldVZ); car.acceleration = (nextLongitudinal - longitudinal) / dt;
    car.throttle = throttle; car.brake = brake; car.steering = steering; car.wheelAngle = wheelAngle; car.slip = slip; car.onCurb = onCurb;
    car.wheelTravel = (car.wheelTravel ?? car.distance) + nextLongitudinal * dt;
    car.curbBounce = onCurb ? Math.sin(car.wheelTravel * 18) * .028 * Math.min(1, car.speed / 3) : 0;
    car.impactSeconds = Math.max(0, (car.impactSeconds ?? 0) - dt);
    car.resetNoticeSeconds=Math.max(0,(car.resetNoticeSeconds??0)-dt);
    car.powerW=12+Math.min(650,engine*Math.abs(nextLongitudinal)/.82);
    car.consumptionWh += car.powerW * dt / 3600;
    car.motorTemp += (car.powerW * .20 - (car.motorTemp - 24) * 2) * dt / 800;
    car.batteryTemp += (car.powerW * .045 - (car.batteryTemp - 24) * .9) * dt / 6000;
}

function updateProgress(car: RaceVehicle, previous: RaceVehicle, dt: number, track: CircuitRuntime, elapsed: number) {
    const surface = locateOnCircuit(car.worldX!, car.worldZ!, track, previous.routeProgress);
    const before = previous.routeProgress ?? (previous.distance % track.length) / track.length;
    let delta = surface.progress - before;
    if (delta < -.5) delta += 1; if (delta > .5) delta -= 1;
    const travel = (previous.lapTravel ?? previous.distance % track.length) + delta * track.length;
    const aligned = Math.cos(car.worldHeading! - track.point(surface.progress).heading) > .2;
    const crossedStart=before>.9&&surface.progress<.1&&aligned&&Math.abs(delta*track.length)<5;
    const completed=crossedStart&&!previous.lapInvalid&&travel>track.length*.8;
    const lap = previous.lapCount ?? Math.floor(previous.distance / track.length);
    car.lapCount = lap + Number(completed); car.routeProgress = surface.progress;
    car.distance = previous.distance + delta * track.length; car.lapTravel = completed ? 0 : travel;
    car.lane = surface.lateral; car.offTrack = outsideAsphalt(car,track);
    car.offTrackSeconds = car.offTrack ? (previous.offTrackSeconds ?? 0) + dt : 0;
    if(crossedStart&&previous.lapInvalid){car.lapInvalid=false;car.lapTravel=0;car.lapStarted=elapsed;car.consumptionWh=0;}
    if (completed) { const lapTime = elapsed - car.lapStarted; car.lastLap = lapTime; car.bestLap = Math.min(car.bestLap ?? Infinity, lapTime); car.lapHistory = [lapTime, ...car.lapHistory].slice(0, 5); car.lastLapWh = car.consumptionWh; car.consumptionWh = 0; car.lapStarted = elapsed; }
}

// Penalize only when all four wheel centres pass the outer rule line.
export function outsideAsphalt(car:RaceVehicle,track:CircuitRuntime){
    const p=pose(car,track),f=forward(p.heading),r=right(p.heading);
    for(const along of [-1.04,1.03])for(const side of [-1,1]){
        const x=p.x+f.x*along+r.x*side*WHEEL_LATERAL_OFFSET,z=p.z+f.z*along+r.z*side*WHEEL_LATERAL_OFFSET;
        if(locateOnCircuit(x,z,track,car.routeProgress).distance<=track.width/2+TRACK_EXIT_MARGIN+.001)return false;
    }
    return true;
}

export function stepPlayerCar(car: RaceVehicle, input: DrivingInput, delta: number, track: CircuitRuntime = DEMO_TRACK, elapsed = car.lapStarted + delta): RaceVehicle {
    const duration = clamp(delta, 0, .05); if (!duration) return car;
    let next = initialize(car, track);
    const steps = Math.ceil(duration / SUBSTEP), dt = duration / steps;
    for (let i = 0; i < steps; i++) { const previous = { ...next }; integrate(next, input, dt, track); resolveBarrier(next, track); updateProgress(next, previous, dt, track, elapsed - duration + (i + 1) * dt); }
    return next;
}

export function stepPlayerWorld(world: RaceWorld, inputs: [DrivingInput, DrivingInput], delta: number, track: CircuitRuntime = DEMO_TRACK, options:PlayerWorldOptions={}): RaceWorld {
    const duration = clamp(delta, 0, .05); if (!duration) return world;
    const steps = Math.ceil(duration / SUBSTEP), dt = duration / steps;
    const count=options.players??2;
    let cars = world.cars.map((car,index) => index<count?initialize(car, track):car) as RaceWorld['cars'];
    for (let i = 0; i < steps; i++) {
        const previous = cars.map(car => ({ ...car }));
        cars.forEach((car,index) => {
            if(index>=count)return;
            if((car.penaltyRemaining??0)>0){car.penaltyRemaining=Math.max(0,car.penaltyRemaining!-dt);car.worldVX=0;car.worldVZ=0;car.yawRate=0;car.speed=0;car.throttle=0;car.brake=1;}
            else integrate(car, inputs[index], dt, track);
        });
        for (let iteration = 0; iteration < 4; iteration++) { cars.forEach((car,index) => {if(index<count&&!(previous[index].penaltyRemaining!>0))resolveBarrier(car,track);}); if(count===2&&!previous.some(car=>(car.penaltyRemaining??0)>0))resolveCarCollision(cars[0],cars[1],track); }
        const elapsed=world.elapsed+(i+1)*dt;
        cars.forEach((car,index) => {if(index<count&&!(previous[index].penaltyRemaining!>0))updateProgress(car,previous[index],dt,track,elapsed);});
        if(options.resetAtTrackEdge){
            for(let index=0;index<count;index++){
                const car=cars[index];
                if((previous[index].penaltyRemaining??0)>0){
                    if((car.penaltyRemaining??0)<=1e-8)cars=recoverPlayer({elapsed,cars},index as 0|1,track,'track',count).cars;
                }else if(outsideAsphalt(car,track)){
                    car.penaltyRemaining=TRACK_EXIT_PENALTY;car.penaltyTotal=(car.penaltyTotal??0)+TRACK_EXIT_PENALTY;car.lapInvalid=true;
                    car.worldVX=0;car.worldVZ=0;car.yawRate=0;car.speed=0;car.throttle=0;car.brake=1;
                }
            }
        }
    }
    return { elapsed: world.elapsed + duration, cars };
}

export function recoverPlayer(world: RaceWorld, index: 0 | 1, track: CircuitRuntime, reason:'manual'|'track'='manual', players:1|2=2): RaceWorld {
    if(reason==='manual'&&(world.cars[index].penaltyRemaining??0)>0)return world;
    const old = world.cars[index], other = pose(world.cars[1-index], track), lane = (index ? 1 : -1) * Math.min(.9, track.width * .19);
    let progress = old.routeProgress ?? (old.distance % track.length) / track.length, target = track.point(progress);
    for (let attempt = 0; attempt < 12; attempt++) { target = track.point(progress); if (players===1||Math.hypot(target.x - other.x, target.z - other.z) > 6) break; progress = (progress - 8 / track.length + 1) % 1; }
    const before=old.routeProgress??((old.distance/track.length)%1+1)%1;
    let shift=progress-before;if(shift>.5)shift-=1;if(shift<-.5)shift+=1;
    const car = { ...old, penaltyRemaining:0, distance:old.distance+shift*track.length,lapInvalid:true,repositionCount:(old.repositionCount??0)+1,trackResets:(old.trackResets??0)+Number(reason==='track'),resetNoticeSeconds:reason==='track'?1.5:0, routeProgress:progress, worldX:target.x+Math.cos(target.heading)*lane, worldZ:target.z-Math.sin(target.heading)*lane, worldHeading:target.heading, worldVX:0, worldVZ:0, yawRate:0, wheelAngle:0, speed:0, acceleration:0, lapTravel:0, lapStarted:world.elapsed, offTrack:false, offTrackSeconds:0, slip:0, onCurb:false, curbBounce:0, impactSeconds:0 };
    const cars = [...world.cars] as RaceWorld['cars']; cars[index] = car; return {...world,cars};
}
