import type { RaceWorld } from './race-engine';

type Sample = { distance: number; time: number };
export type PlayerGap = { leader: 0 | 1; seconds: number } | null;

// Compare actual passage times at the trailing car's position, never distance / speed.
export function createPlayerGapTracker() {
    const history: [Sample[], Sample[]] = [[], []];
    const generations = [-1, -1];
    return {
        clear() { history[0]=[];history[1]=[];generations[0]=generations[1]=-1; },
        record(world: RaceWorld): PlayerGap {
            if(world.cars.some((car,index)=>(car.repositionCount??0)!==generations[index])||world.elapsed<(history[0][history[0].length-1]?.time??0)){
                history[0]=[];history[1]=[];world.cars.forEach((car,index)=>generations[index]=car.repositionCount??0);
            }
            world.cars.forEach((car,index)=>{
                const generation=car.repositionCount??0;
                if(generation!==generations[index]){history[index as 0|1]=[];generations[index]=generation;}
                const samples=history[index],last=samples[samples.length-1];
                if(!last||world.elapsed>last.time) samples.push({distance:car.distance,time:world.elapsed});
                if(samples.length>12000)samples.splice(0,2000);
            });
            const leader:0|1=world.cars[0].distance>=world.cars[1].distance?0:1;
            const target=world.cars[1-leader].distance,samples=history[leader];
            if(Math.abs(world.cars[0].distance-world.cars[1].distance)<.01)return {leader,seconds:0};
            for(let i=samples.length-1;i>0;i--){
                const a=samples[i-1],b=samples[i];
                if(b.distance<=a.distance||target<a.distance||target>b.distance)continue;
                const passed=a.time+(b.time-a.time)*(target-a.distance)/(b.distance-a.distance);
                return {leader,seconds:Math.max(0,world.elapsed-passed)};
            }
            return null;
        },
    };
}
