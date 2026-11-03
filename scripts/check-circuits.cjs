const fs=require('fs'),Module=require('module'),assert=require('assert');
const root=process.cwd(),ts=require(root+'/node_modules/typescript');
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
const lib=require(root+'/lib/circuits.ts'),engine=require(root+'/lib/race-engine.ts');
const base={version:1,id:'qa',name:'QA pista',competition:'Prueba local',width:6,source:'map',updatedAt:'qa'};
const square={...base,vertices:[{x:0,z:0},{x:200,z:0},{x:200,z:100},{x:0,z:100}]};
const track=lib.createCircuitRuntime(square);assert.equal(track.length,600);assert.deepEqual(track.point(0),track.point(1));assert.equal(track.samples,720);
const wide={...base,vertices:square.vertices.map(p=>({x:p.x*10,z:p.z*10}))};assert.equal(lib.createCircuitRuntime(wide).length,6000);
const calibrated=lib.imageToVertices([{x:0,z:0},{x:400,z:0},{x:400,z:200},{x:0,z:200}],[{x:0,z:0},{x:100,z:0}],50);assert.equal(lib.createCircuitRuntime({...square,vertices:calibrated}).length,600);
assert.throws(()=>lib.imageToVertices(square.vertices,[],0));assert.throws(()=>lib.createCircuitRuntime({...square,width:0}));assert.throws(()=>lib.createCircuitRuntime({...square,vertices:[{x:NaN,z:0},{x:0,z:0},{x:1,z:1}]}));
const geographic=[{lat:43.3,lng:-2.9},{lat:43.3,lng:-2.898},{lat:43.301,lng:-2.898},{lat:43.301,lng:-2.9}];
const geo={...base,geographic,vertices:lib.geoToVertices(geographic)};const valid=lib.validateCircuit(geo),geoTrack=lib.createCircuitRuntime(valid);assert(geoTrack.length>500&&geoTrack.length<600);
const rotated=[...geographic.slice(2),...geographic.slice(0,2)];assert(Math.abs(lib.createCircuitRuntime({...geo,vertices:lib.geoToVertices(rotated)}).length-geoTrack.length)<1e-6);
const reversed=[geographic[0],...geographic.slice(1).reverse()];assert(Math.abs(lib.createCircuitRuntime({...geo,vertices:lib.geoToVertices(reversed)}).length-geoTrack.length)<1e-6);
const routes=lib.parseGeographicRoutes(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Test geo'},geometry:{type:'LineString',coordinates:geographic.map(p=>[p.lng,p.lat])}}]}),'geojson');assert.equal(routes.length,1);assert.equal(routes[0].points[0].lng,-2.9);assert.equal(routes[0].points[0].lat,43.3);
assert.throws(()=>lib.parseGeographicRoutes('{bad','geojson'));assert.throws(()=>lib.parseGeographicRoutes('{"type":"Point","coordinates":[0,0]}','geojson'));assert.throws(()=>lib.validateCircuit({...square,source:'image'}));
const xml=lib.circuitKml({...geo,name:'Pista <A> & equipo'});assert(xml.includes('Pista &lt;A&gt; &amp; equipo'));assert(xml.includes('-2.9,43.3,0'));
for(const circuit of [track,lib.createCircuitRuntime(wide),geoTrack]){
 let state=engine.createRaceWorld(circuit);for(let i=0;i<60*180;i++){const before=state;state=engine.stepRace(state,1/60,circuit);state.cars.forEach((car,j)=>{assert(Object.values(car).filter(v=>typeof v==='number').every(Number.isFinite));assert(car.distance>=before.cars[j].distance);assert(car.consumptionWh>=before.cars[j].consumptionWh);const pose=engine.vehiclePose(car,circuit);assert(Number.isFinite(pose.x)&&Number.isFinite(pose.heading));});}
 assert(state.cars.every(c=>c.distance>500));console.log('OK circuito',circuit.length.toFixed(2),'m',state.cars.map(c=>c.distance.toFixed(1)).join(' / '));
}
console.log('OK: escala de imagen, coordenadas, meta/sentido, formatos, validaciones y simulación en tres trazados.');
