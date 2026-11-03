import { lapProgress, trackPoint } from './race-track';

// Original, code-rendered onboard preview. This is not footage from a real camera or an AI video service.
export function drawRaceFrame(ctx: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    const progress=lapProgress(seconds),camera=trackPoint(progress),ahead=trackPoint(progress+.012);
    const yaw=Math.atan2(ahead.x-camera.x,ahead.z-camera.z),c=Math.cos(yaw),s=Math.sin(yaw);
    const focal=width*.78,horizon=height*.43,roadWidth=4.1;
    const project=(x:number,y:number,z:number)=>{
        const dx=x-camera.x,dz=z-camera.z,depth=dx*s+dz*c;
        return {x:width/2+(dx*c-dz*s)*focal/Math.max(.5,depth),y:horizon+(1.05-y)*focal/Math.max(.5,depth),depth};
    };
    const polygon=(points:{x:number;y:number;depth:number}[],color:string)=>{
        if(points.some(p=>p.depth<.8))return;
        ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
    };
    const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#65a9cf');sky.addColorStop(.48,'#d5e9ee');sky.addColorStop(1,'#b2c9ab');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#a7b8a0';ctx.beginPath();ctx.moveTo(0,horizon);for(let x=0;x<=width;x+=30)ctx.lineTo(x,horizon-13-17*Math.sin(x*.007+yaw)-8*Math.sin(x*.022));ctx.lineTo(width,horizon+20);ctx.lineTo(0,horizon+20);ctx.fill();
    ctx.fillStyle='#7b956a';ctx.fillRect(0,horizon,width,height-horizon);
    const commands:{depth:number;draw:()=>void}[]=[];
    for(let i=0;i<360;i++){
        const a=trackPoint(i/360),b=trackPoint((i+1)/360),rightA={x:Math.cos(a.heading),z:-Math.sin(a.heading)},rightB={x:Math.cos(b.heading),z:-Math.sin(b.heading)};
        const edge=(p:typeof a,right:typeof rightA,offset:number)=>project(p.x+right.x*offset,0,p.z+right.z*offset);
        const depth=(project(a.x,0,a.z).depth+project(b.x,0,b.z).depth)/2;
        if(depth<.5||depth>220)continue;
        commands.push({depth,draw:()=>{
            polygon([edge(a,rightA,-5.8),edge(b,rightB,-5.8),edge(b,rightB,5.8),edge(a,rightA,5.8)],i%2?'#829b6e':'#7d9769');
            polygon([edge(a,rightA,-roadWidth-.65),edge(b,rightB,-roadWidth-.65),edge(b,rightB,roadWidth+.65),edge(a,rightA,roadWidth+.65)],Math.floor(i/2)%2?'#e9e5df':'#bd3c3e');
            polygon([edge(a,rightA,-roadWidth),edge(b,rightB,-roadWidth),edge(b,rightB,roadWidth),edge(a,rightA,roadWidth)],i%2?'#535a5d':'#51585b');
            for(const side of [-1,1])polygon([edge(a,rightA,side*(roadWidth-.12)),edge(b,rightB,side*(roadWidth-.12)),edge(b,rightB,side*(roadWidth-.24)),edge(a,rightA,side*(roadWidth-.24))],'#dce0d8');
            if(i===0||i===1)for(let cell=0;cell<10;cell++)polygon([edge(a,rightA,-roadWidth+cell*roadWidth/5),edge(b,rightB,-roadWidth+cell*roadWidth/5),edge(b,rightB,-roadWidth+(cell+1)*roadWidth/5),edge(a,rightA,-roadWidth+(cell+1)*roadWidth/5)],(cell+i)%2?'#f4f3ef':'#252a2c');
        }});
    }
    for(let i=0;i<105;i++){
        const p=trackPoint(i/105),side=i%2?1:-1,offset=12+(i%7)*2.5;
        const x=p.x+Math.cos(p.heading)*offset*side,z=p.z-Math.sin(p.heading)*offset*side,base=project(x,0,z),top=project(x,5.5+(i%5),z);
        if(base.depth<2||base.depth>210)continue;
        commands.push({depth:base.depth,draw:()=>{
            const h=base.y-top.y,r=h*.3;
            ctx.fillStyle='#5e5945';ctx.fillRect(base.x-h*.025,base.y-h*.65,h*.05,h*.65);
            ctx.fillStyle=i%3?'#486a4a':'#537650';ctx.beginPath();ctx.ellipse(base.x,top.y+h*.32,r,h*.38,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='#5c7b52';ctx.beginPath();ctx.ellipse(base.x-r*.17,top.y+h*.22,r*.7,h*.26,0,0,Math.PI*2);ctx.fill();
        }});
    }
    for(const [position,side,label] of [[.13,1,'50'],[.43,-1,'50'],[.68,1,'30'],[.91,-1,'50']] as const){
        const p=trackPoint(position),x=p.x+Math.cos(p.heading)*7*side,z=p.z-Math.sin(p.heading)*7*side,a=project(x,0,z),b=project(x,1.2,z);
        if(a.depth<2||a.depth>140)continue;
        commands.push({depth:a.depth,draw:()=>{const h=a.y-b.y;ctx.fillStyle='#eceee8';ctx.fillRect(b.x-h*.25,b.y,h*.5,h);ctx.fillStyle='#303b43';ctx.font=`bold ${Math.max(5,h*.32)}px sans-serif`;ctx.textAlign='center';ctx.fillText(label,b.x,b.y+h*.6);}});
    }
    const building=trackPoint(.025),normal={x:Math.cos(building.heading),z:-Math.sin(building.heading)};
    const center={x:building.x+normal.x*20,z:building.z+normal.z*20};
    const corners=[[-12,-5],[12,-5],[12,5],[-12,5]].map(([dx,dz])=>({x:center.x+dx,z:center.z+dz}));
    const depth=project(center.x,0,center.z).depth;
    if(depth>1&&depth<200)commands.push({depth,draw:()=>{
        const top=corners.map(p=>project(p.x,5,p.z)),bottom=corners.map(p=>project(p.x,0,p.z));
        for(let i=0;i<4;i++)polygon([bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i]],i%2?'#9da5a3':'#c2c7c3');
        polygon(top,'#414e57');
    }});
    commands.sort((a,b)=>b.depth-a.depth).forEach(item=>item.draw());
    // The reference camera sits low on a compact, single-seater electric car.
    const hood=ctx.createLinearGradient(0,height*.83,0,height);hood.addColorStop(0,'#d63140');hood.addColorStop(1,'#831c2a');ctx.fillStyle=hood;
    ctx.beginPath();ctx.moveTo(width*.35,height);ctx.lineTo(width*.405,height*.86);ctx.quadraticCurveTo(width*.5,height*.80,width*.595,height*.86);ctx.lineTo(width*.65,height);ctx.closePath();ctx.fill();
    ctx.fillStyle='#20272c';ctx.beginPath();ctx.moveTo(width*.44,height);ctx.lineTo(width*.47,height*.87);ctx.lineTo(width*.53,height*.87);ctx.lineTo(width*.56,height);ctx.fill();
    ctx.fillStyle='#252a2e';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(width*(.5+side*.225),height*.97,width*.045,height*.13,side*.12,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#424a4e';ctx.lineWidth=height*.012;ctx.beginPath();ctx.moveTo(width*.28,height);ctx.lineTo(width*.39,height*.92);ctx.moveTo(width*.72,height);ctx.lineTo(width*.61,height*.92);ctx.stroke();
    const vignette=ctx.createRadialGradient(width/2,height/2,height*.2,width/2,height/2,width*.65);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#12202b45');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
}
