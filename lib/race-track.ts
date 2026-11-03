export const LAP_SECONDS = 60;
export const LAP_DISTANCE_METRES = 34 / 3.6 * LAP_SECONDS;
export type TrackPoint = { x: number; z: number; heading: number };

const knots = [[0,-125],[88,-115],[130,-48],[105,25],[140,85],[75,125],[0,115],[-95,135],[-135,70],[-105,0],[-130,-72],[-70,-125]];
function catmull(t: number) {
    const u = ((t % 1) + 1) % 1 * knots.length;
    const i = Math.floor(u), f = u - i;
    const points = [-1,0,1,2].map(offset => knots[(i + offset + knots.length) % knots.length]);
    return [0,1].map(axis => .5 * ((2 * points[1][axis]) + (-points[0][axis] + points[2][axis]) * f + (2 * points[0][axis] - 5 * points[1][axis] + 4 * points[2][axis] - points[3][axis]) * f*f + (-points[0][axis] + 3*points[1][axis] - 3*points[2][axis] + points[3][axis]) * f*f*f));
}
const raw = Array.from({length:721}, (_,i) => catmull(i/720));
const distances = [0];
for(let i=1;i<raw.length;i++) distances.push(distances[i-1]+Math.hypot(raw[i][0]-raw[i-1][0],raw[i][1]-raw[i-1][1]));
const total = distances[distances.length-1];
const scale = LAP_DISTANCE_METRES / total;

export function trackPoint(progress: number): TrackPoint {
    const distance = (((progress % 1)+1)%1)*total;
    let lo=0,hi=distances.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(distances[mid]<distance)lo=mid;else hi=mid;}
    const f=(distance-distances[lo])/(distances[hi]-distances[lo]);
    const a=raw[lo],b=raw[hi];
    return {x:(a[0]+(b[0]-a[0])*f)*scale,z:(a[1]+(b[1]-a[1])*f)*scale,heading:Math.atan2(b[0]-a[0],b[1]-a[1])};
}
export function lapProgress(seconds: number) {
    const t=((seconds%LAP_SECONDS)+LAP_SECONDS)%LAP_SECONDS;
    const w=2*Math.PI/LAP_SECONDS;
    return (34*t+9/(2*w)*(1-Math.cos(2*w*t))+4/(5*w)*(1-Math.cos(5*w*t)))/(34*LAP_SECONDS);
}
export function lapSpeed(seconds: number) {
    const w=2*Math.PI/LAP_SECONDS;
    return 34+9*Math.sin(seconds*w*2)+4*Math.sin(seconds*w*5);
}
export function drivingState(seconds: number) {
    const w=2*Math.PI/LAP_SECONDS;
    const acceleration=18*w*Math.cos(seconds*w*2)+20*w*Math.cos(seconds*w*5);
    const p=lapProgress(seconds),a=trackPoint(p),b=trackPoint(p+.004);
    let turn=b.heading-a.heading;
    while(turn>Math.PI)turn-=2*Math.PI;while(turn< -Math.PI)turn+=2*Math.PI;
    return {throttle:Math.max(0,Math.min(1,.45+acceleration*.22)),brake:Math.max(0,Math.min(1,-acceleration*.32)),steering:Math.max(-1,Math.min(1,turn*14))};
}
export const TRACK_OUTLINE = Array.from({length:361},(_,i)=>trackPoint(i/360));
export const TRACK_VIEWBOX = '-110 -105 220 210';
