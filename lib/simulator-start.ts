export const START_LIGHT_SECONDS = 5;
// This clock advances only while the simulator is ready and unpaused.
export function advanceStartLights(remaining:number,delta:number){
    const next=remaining-Math.max(0,Math.min(.1,delta));return next<1e-8?0:next;
}
export function startLightCount(remaining:number){
    return remaining<=0?0:Math.min(5,Math.floor(START_LIGHT_SECONDS-remaining+1e-8)+1);
}
