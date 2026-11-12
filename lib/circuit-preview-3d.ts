import * as THREE from 'three';
import type { CircuitRuntime } from './circuits';
import type { EnvironmentBuilding, EnvironmentSurface, RealWorldEnvironment } from './real-world-environment';

const surfaceColors: Record<string, string> = {
    water: '#7299b3',
    forest: '#456b43',
    grass: '#8b9b68',
    field: '#a99d68',
    industrial: '#92908a',
    residential: '#b0a891',
    scrub: '#798052',
    sport: '#779461',
};

export function createCircuitPreview3d(canvas: HTMLCanvasElement, track: CircuitRuntime, environment: RealWorldEnvironment) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#c7dce5');
    scene.fog = new THREE.Fog('#c7dce5', Math.max(400, track.bounds.span * 2), Math.max(1600, track.bounds.span * 7));
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, Math.max(5000, track.bounds.span * 12));
    scene.add(new THREE.HemisphereLight('#e7f2ff', '#596047', 2.4));
    const sun = new THREE.DirectionalLight('#fff1d4', 2.3);
    sun.position.set(80, 140, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const terrain = environment.terrain;
    const elevationAt = (x: number, z: number) => {
        let bestDistance = Infinity, elevation = 0;
        for (const point of terrain.points) {
            const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
            if (distance < bestDistance) { bestDistance = distance; elevation = point.elevation; }
        }
        return elevation;
    };
    const baseline = track.outline.reduce((sum, point) => sum + (elevationAt(point.x, point.z) - point.y), 0) / track.outline.length;
    const localHeight = (x: number, z: number) => elevationAt(x, z) - baseline;
    const positions: number[] = [], indices: number[] = [];
    for (let row = 0; row < terrain.rows; row++) {
        for (let column = 0; column < terrain.columns; column++) {
            const point = terrain.points[row * terrain.columns + column];
            positions.push(point.x, point.elevation - baseline, point.z);
            if (row < terrain.rows - 1 && column < terrain.columns - 1) {
                const index = row * terrain.columns + column;
                indices.push(index, index + 1, index + terrain.columns, index + 1, index + terrain.columns + 1, index + terrain.columns);
            }
        }
    }
    const terrainGeometry = new THREE.BufferGeometry();
    terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    terrainGeometry.setIndex(indices);
    terrainGeometry.computeVertexNormals();
    const ground = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ color: '#72875c', roughness: 1, side: THREE.DoubleSide }));
    ground.receiveShadow = true;
    scene.add(ground);

    function polygon(points: { x: number; z: number }[]) {
        const shape = new THREE.Shape();
        points.forEach((point, index) => {
            if (index === 0) shape.moveTo(point.x, -point.z);
            else shape.lineTo(point.x, -point.z);
        });
        shape.closePath();
        return shape;
    }
    for (const surface of environment.surfaces) addSurface(surface);
    for (const building of environment.buildings) addBuilding(building);

    function addSurface(surface: EnvironmentSurface) {
        const geometry = new THREE.ShapeGeometry(polygon(surface.points));
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), z = -position.getY(i);
            position.setZ(i, localHeight(x, z) + .08);
        }
        geometry.rotateX(-Math.PI / 2);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: surfaceColors[surface.kind] ?? '#829169',
            roughness: 1,
            side: THREE.DoubleSide,
            transparent: surface.kind === 'water',
            opacity: surface.kind === 'water' ? .9 : 1,
        }));
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
    function addBuilding(building: EnvironmentBuilding) {
        const shape = polygon(building.points);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        const center = building.points.reduce((point, current) => ({ x: point.x + current.x / building.points.length, z: point.z + current.z / building.points.length }), { x: 0, z: 0 });
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#b8b2a5', roughness: .88, side: THREE.DoubleSide }));
        mesh.position.y = localHeight(center.x, center.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }

    const roadPositions: number[] = [], roadIndices: number[] = [];
    const width = track.width / 2;
    for (let i = 0; i <= track.samples; i++) {
        const point = track.point(i / track.samples), nx = Math.cos(point.heading), nz = -Math.sin(point.heading);
        for (const offset of [-width, width]) roadPositions.push(point.x + nx * offset, point.y + .15, point.z + nz * offset);
        if (i < track.samples) {
            const index = i * 2;
            roadIndices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3);
        }
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeometry.setIndex(roadIndices);
    roadGeometry.computeVertexNormals();
    const road = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({ color: '#4d5051', roughness: .94, side: THREE.DoubleSide }));
    road.receiveShadow = true;
    scene.add(road);

    const target = new THREE.Vector3(0, track.elevation.range / 2, 0);
    const size = Math.max(100, track.bounds.span * 1.35);
    let yaw = .72, pitch = .52, distance = size * 1.25, dragging = false, previousX = 0, previousY = 0;
    const updateCamera = () => {
        camera.position.set(
            target.x + Math.sin(yaw) * distance * Math.cos(pitch),
            target.y + Math.sin(pitch) * distance,
            target.z + Math.cos(yaw) * distance * Math.cos(pitch),
        );
        camera.lookAt(target);
    };
    const resize = () => {
        const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };
    const onDown = (event: PointerEvent) => { dragging = true; previousX = event.clientX; previousY = event.clientY; canvas.setPointerCapture(event.pointerId); };
    const onMove = (event: PointerEvent) => {
        if (!dragging) return;
        yaw -= (event.clientX - previousX) * .006;
        pitch = Math.max(.12, Math.min(1.25, pitch + (event.clientY - previousY) * .005));
        previousX = event.clientX; previousY = event.clientY;
        updateCamera();
    };
    const onUp = () => { dragging = false; };
    const onWheel = (event: WheelEvent) => { event.preventDefault(); distance = Math.max(size * .25, Math.min(size * 5, distance * Math.exp(event.deltaY * .001))); updateCamera(); };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    updateCamera();
    renderer.render(scene, camera);

    return {
        dispose() {
            observer.disconnect();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            canvas.removeEventListener('wheel', onWheel);
            const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
            scene.traverse(object => {
                const item = object as THREE.Mesh;
                if (item.geometry) geometries.add(item.geometry);
                if (item.material) for (const material of Array.isArray(item.material) ? item.material : [item.material]) materials.add(material);
            });
            for (const geometry of geometries) geometry.dispose();
            for (const material of materials) material.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
        },
    };
}
