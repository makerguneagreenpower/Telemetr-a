import * as THREE from 'three';
import { DEMO_TRACK, type CircuitRuntime } from './circuits';
import { vehiclePose, type RaceWorld } from './race-engine';

export type RaceCamera = 'duel' | 'car-1' | 'car-2' | 'aerial';

export function createRaceScene(canvas: HTMLCanvasElement, track: CircuitRuntime = DEMO_TRACK) {
    const trackPoint = track.point, roadWidth = track.width / 2, barrier = roadWidth + 4, segmentCount = track.samples;
    const extent = Math.max(160, track.bounds.span);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bdd8e6');
    scene.fog = new THREE.Fog('#c3d6d5', Math.max(110, extent * .5), Math.max(340, extent * 2));
    const camera = new THREE.PerspectiveCamera(52, 16 / 9, .08, Math.max(650, extent * 5));
    scene.add(new THREE.HemisphereLight('#deedff', '#65704b', 2.2));
    const sun = new THREE.DirectionalLight('#fff3d8', 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 160 });
    sun.shadow.normalBias = .035;
    scene.add(sun, sun.target);

    const material = (color: string, roughness = .65, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const asphalt = material('#55595a', .95), grass = material('#72875c', 1);
    const rubber = material('#191d20', .95), metal = material('#b7c0c4', .34, .8), dark = material('#20262a', .55);
    const white = material('#f2f3ee', .26, .15), red = material('#d82439', .25, .2);
    function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
        const item = new THREE.Mesh(geometry, mat); item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
    }
    function box(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
        return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
    }
    function tube(parent: THREE.Object3D, points: number[][], radius: number, mat: THREE.Material) {
        return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number]))), 24, radius, 6, false), mat, parent);
    }
    const ground = mesh(new THREE.PlaneGeometry(extent + 350, extent + 350), grass, scene, 0, -.025, 0); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    // Procedural surfaces are generated locally; the scene has no external asset requests.
    function noiseTexture(base: number, spread: number) {
        const tile = document.createElement('canvas'); tile.width = tile.height = 128;
        const ctx = tile.getContext('2d')!; const pixels = ctx.createImageData(128, 128);
        let seed = 321;
        for (let i = 0; i < pixels.data.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; const shade = base + (seed / 4294967296 - .5) * spread; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade; pixels.data[i + 3] = 255; }
        ctx.putImageData(pixels, 0, 0);
        const texture = new THREE.CanvasTexture(tile); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; return texture;
    }
    grass.map = noiseTexture(190, 45); grass.map.repeat.set((extent + 350) / 7, (extent + 350) / 7);
    asphalt.map = noiseTexture(200, 40);

    function ribbon(left: number, right: number, y: number, mat: THREE.Material, striped = false) {
        const vertices: number[] = [], indices: number[] = [], colors: number[] = [], uv: number[] = [];
        for (let i = 0; i <= segmentCount; i++) {
            const p = trackPoint(i / segmentCount), nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
            for (const offset of [left, right]) { vertices.push(p.x + nx * offset, y, p.z + nz * offset); uv.push(offset * .6, i * .5); const color = new THREE.Color(Math.floor(i / 3) % 2 ? '#eeebe3' : '#c62c3c'); colors.push(color.r, color.g, color.b); }
            if (i < segmentCount) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
        if (striped) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const road = mesh(geo, mat, scene); road.castShadow = false; return road;
    }
    ribbon(-roadWidth, roadWidth, .01, asphalt);
    const curb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
    ribbon(-roadWidth-.6, -roadWidth, .025, curb, true); ribbon(roadWidth, roadWidth+.6, .025, curb, true);
    ribbon(-roadWidth+.16, -roadWidth+.26, .018, white); ribbon(roadWidth-.26, roadWidth-.16, .018, white);
    ribbon(-barrier-.1, -barrier+.1, .7, metal); ribbon(barrier-.1, barrier+.1, .7, metal);
    const start = trackPoint(0), columns = Math.ceil(track.width * 2), cellWidth = track.width / columns;
    for (let row = 0; row < 2; row++) for (let col = 0; col < columns; col++) {
        const offset = -roadWidth + (col + .5) * cellWidth;
        const square = box(scene, (row + col) % 2 ? white : dark, start.x + Math.cos(start.heading) * offset + Math.sin(start.heading) * row * .4, .023, start.z - Math.sin(start.heading) * offset + Math.cos(start.heading) * row * .4, cellWidth, .01, .4); square.rotation.y = start.heading; square.castShadow = false;
    }
    function clearOfRoad(x: number, z: number, margin: number) {
        const limit=(roadWidth+margin)**2;
        for(let i=1;i<track.outline.length;i++){
            const a=track.outline[i-1],b=track.outline[i],dx=b.x-a.x,dz=b.z-a.z;
            const ratio=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
            if((x-a.x-dx*ratio)**2+(z-a.z-dz*ratio)**2<limit)return false;
        }
        return true;
    }
    // Instanced scenery keeps the two-car scene light enough for laptops.
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .27, 2.5, 6), material('#75654c'), 96);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material('#4d7046', 1), 96);
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
    for (let i = 0; i < 96; i++) {
        const p = trackPoint(i / 96), side = i % 2 ? 1 : -1, offset = side * (roadWidth + 12 + (i * 17 % 19)), x = p.x + Math.cos(p.heading) * offset, z = p.z - Math.sin(p.heading) * offset;
        const visible=clearOfRoad(x,z,3)?1:0;
        matrix.compose(new THREE.Vector3(x, 1.25, z), rotation, new THREE.Vector3(visible,visible,visible)); trunks.setMatrixAt(i, matrix);
        matrix.compose(new THREE.Vector3(x, 4.4, z), rotation, new THREE.Vector3(visible*(2 + i % 3 * .4), visible*(3 + i % 4 * .3), visible*2.2)); crowns.setMatrixAt(i, matrix);
    }
    scene.add(trunks, crowns);
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .055, 1, 5), metal, 144);
    for (let i = 0; i < 144; i++) { const p = trackPoint(Math.floor(i / 2) / 72), offset = i % 2 ? barrier : -barrier; matrix.makeTranslation(p.x + Math.cos(p.heading) * offset, .5, p.z - Math.sin(p.heading) * offset); post.setMatrixAt(i, matrix); } scene.add(post);
    const pit = new THREE.Group(); pit.position.set(start.x + Math.cos(start.heading) * (roadWidth + 12), 0, start.z - Math.sin(start.heading) * (roadWidth + 12)); pit.rotation.y = start.heading; pit.visible=clearOfRoad(pit.position.x,pit.position.z,13); scene.add(pit);
    box(pit, material('#d1d4cc'), 0, 2.4, 0, 7, 4.8, 22); box(pit, dark, 0, 4.9, 0, 7.5, .3, 23);
    for (let i = 0; i < 5; i++) box(pit, dark, -3.51, 1.5, -8 + i * 4, .04, 2.5, 3.3);
    box(pit, red, -3.56, 4.3, 0, .06, .3, 22);

    function makeCar(index: number) {
        const group = new THREE.Group(); scene.add(group);
        const paint = index ? red : white;
        const body = mesh(new THREE.SphereGeometry(1, 32, 16), paint, group, 0, .36, .03); body.scale.set(.46, .30, 1.62);
        const nose = mesh(new THREE.SphereGeometry(1, 24, 12), paint, group, 0, .35, 1.07); nose.scale.set(.31, .22, .78);
        const stripe = mesh(new THREE.SphereGeometry(1, 24, 12), dark, group, 0, .40, 1.04); stripe.scale.set(.105, .19, .78);
        const cockpit = mesh(new THREE.SphereGeometry(1, 24, 16), dark, group, 0, .59, -.22); cockpit.scale.set(.33, .16, .65);
        const torso = mesh(new THREE.SphereGeometry(1, 16, 12), material(index ? '#262b31' : '#353f49'), group, 0, .70, -.25); torso.scale.set(.24, .27, .37);
        const helmet = mesh(new THREE.SphereGeometry(.20, 24, 16), index ? red : white, group, 0, 1.02, -.50); helmet.scale.set(1, 1.15, 1.04);
        const visor = mesh(new THREE.SphereGeometry(1, 20, 12), material('#1b3342', .12, .6), group, 0, 1.02, -.358); visor.scale.set(.175, .085, .09);
        tube(group, [[-.38,.35,-.83],[-.38,1.16,-.83],[0,1.25,-.83],[.38,1.16,-.83],[.38,.35,-.83]], .027, metal);
        for (const side of [-1, 1]) tube(group, [[side*.35,.34,-1.35],[side*.43,.48,-.7],[side*.37,.43,.4],[side*.12,.25,1.6]], .018, metal);
        // Exactly two battery cases are behind the driver.
        for (const side of [-1, 1]) box(group, dark, side * .17, .56, -1.13, .28, .18, .30);
        const motor = mesh(new THREE.CylinderGeometry(.085,.085,.30,16), metal, group, 0,.31,-1.45); motor.rotation.z = Math.PI/2;
        const steering = mesh(new THREE.TorusGeometry(.15,.018,6,20), dark, group, 0,.70,.25); steering.rotation.x = -.35;
        const wheels: THREE.Group[] = [];
        for (const z of [-1.04, 1.03]) for (const side of [-1, 1]) {
            const hub = new THREE.Group(); hub.position.set(side * .64, .31, z); group.add(hub);
            const wheel = new THREE.Group(); hub.add(wheel); wheels.push(wheel);
            const tyre = mesh(new THREE.TorusGeometry(.274,.035,8,28), rubber, wheel); tyre.rotation.y = Math.PI / 2;
            const rim = mesh(new THREE.TorusGeometry(.238,.01,5,28), metal, wheel); rim.rotation.y = Math.PI / 2;
            for (let i = 0; i < 10; i++) { const spoke = box(wheel, metal, 0,0,0,.009,.009,.48); spoke.rotation.x = i * Math.PI / 10; }
            tube(group, [[side*.25,.27,z-.15],[side*.64,.31,z],[side*.25,.27,z+.15]], .012, metal);
        }
        const labelCanvas = document.createElement('canvas'); labelCanvas.width = 128; labelCanvas.height = 56;
        const ctx = labelCanvas.getContext('2d')!; ctx.fillStyle = index ? '#d82439' : '#f2f3ee'; ctx.fillRect(0,0,128,56); ctx.fillStyle = index ? '#fff' : '#242b30'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign='center'; ctx.fillText(index ? '02' : '01',64,39);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), depthTest: false })); label.position.set(0,1.85,0); label.scale.set(1.15,.5,1); group.add(label);
        return { group, wheels };
    }
    const models = [makeCar(0), makeCar(1)];
    const desired = new THREE.Vector3(), target = new THREE.Vector3(), looking = new THREE.Vector3();
    let initialized = false, previousMode: RaceCamera | null = null;

    return {
        render(world: RaceWorld, mode: RaceCamera, dt: number) {
            const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight), ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            const w = Math.min(1800, Math.round(width * ratio)), h = Math.round(height * w / width);
            if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w,h,false); camera.aspect=width/height; camera.updateProjectionMatrix(); }
            const poses = world.cars.map(car => vehiclePose(car, track));
            models.forEach((model, index) => { const car=world.cars[index], pose=poses[index]; model.group.position.set(pose.x, Math.sin(car.distance*3)*.004, pose.z); model.group.rotation.set(-car.acceleration*.012,pose.heading,-car.steering*car.speed*.0015); model.wheels.forEach(wheel=>wheel.rotation.x=car.distance/.274); });
            const center = new THREE.Vector3((poses[0].x+poses[1].x)/2,0,(poses[0].z+poses[1].z)/2);
            if (mode === 'aerial') { desired.set(extent*.55,extent*1.15,extent*.75); target.set(0,0,0); }
            else if (mode === 'car-1' || mode === 'car-2') {
                const p=poses[mode==='car-1'?0:1], forward=new THREE.Vector3(Math.sin(p.heading),0,Math.cos(p.heading));
                desired.set(p.x,1.15,p.z).addScaledVector(forward,.10); target.set(p.x,1.05,p.z).addScaledVector(forward,20);
            } else {
                const gap=Math.hypot(poses[0].x-poses[1].x,poses[0].z-poses[1].z), heading=poses[0].heading;
                desired.copy(center).add(new THREE.Vector3(-Math.sin(heading)*(10+gap*.9)+Math.cos(heading)*7,6+gap*.45,-Math.cos(heading)*(10+gap*.9)-Math.sin(heading)*7)); target.copy(center).add(new THREE.Vector3(0,.5,0));
            }
            const snap=!initialized||previousMode!==mode||mode==='car-1'||mode==='car-2';
            const smoothing=1-Math.exp(-Math.max(.001,dt)*4);
            if(snap){camera.position.copy(desired);looking.copy(target);}else{camera.position.lerp(desired,smoothing);looking.lerp(target,smoothing);}
            camera.lookAt(looking); initialized=true; previousMode=mode;
            sun.target.position.copy(center); sun.position.copy(center).add(new THREE.Vector3(35,65,25)); sun.target.updateMatrixWorld();
            renderer.render(scene,camera);
        },
        dispose() {
            const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
            scene.traverse(object=>{const item=object as THREE.Mesh;if(item.geometry)geometries.add(item.geometry);if(item.material)for(const mat of Array.isArray(item.material)?item.material:[item.material])materials.add(mat);});
            for(const mat of materials){for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);mat.dispose();}
            for(const geometry of geometries)geometry.dispose();for(const texture of textures)texture.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();
        },
    };
}
