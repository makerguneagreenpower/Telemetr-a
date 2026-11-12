'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Mountain, Rotate3D } from 'lucide-react';
import type { GeoPoint, CircuitRuntime } from '../lib/circuits';
import { fetchRealWorldEnvironment, type RealWorldEnvironment } from '../lib/real-world-environment';

export default function CircuitRealWorldPreview({ track, route }: { track: CircuitRuntime | null; route: GeoPoint[] }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const request = useRef<AbortController | null>(null);
    const [environment, setEnvironment] = useState<RealWorldEnvironment>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rendererReady, setRendererReady] = useState(false);

    useEffect(() => () => request.current?.abort(), []);

    useEffect(() => {
        const node = canvas.current;
        if (!node || !track || !environment) return;
        let active = true;
        let scene: ReturnType<typeof import('../lib/circuit-preview-3d').createCircuitPreview3d> | undefined;
        import('../lib/circuit-preview-3d').then(module => {
            if (!active) return;
            scene = module.createCircuitPreview3d(node, track, environment);
            setRendererReady(true);
        }).catch(() => {
            if (active) setError('No se pudo iniciar la vista 3D en este navegador.');
        });
        return () => { active = false; scene?.dispose(); };
    }, [track, environment]);

    async function loadEnvironment() {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError('');
        if (!environment) setRendererReady(false);
        try {
            setEnvironment(await fetchRealWorldEnvironment(route, controller.signal));
        } catch (cause) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el entorno real.');
        } finally {
            if (request.current === controller) {
                request.current = null;
                setLoading(false);
            }
        }
    }

    if (!track || route.length < 3) {
        return <section className="panel circuit-real-world">
            <div className="panel-heading"><div><h2><Rotate3D size={18} />Entorno real en 3D</h2><p>Para consultar el lugar real, dibuja el circuito sobre el mapa o importa coordenadas geográficas.</p></div></div>
            <p className="circuit-real-world-note">Los trazados hechos sobre una imagen no tienen una ubicación geográfica; para ellos se mantiene la simulación 3D habitual.</p>
        </section>;
    }

    return <section className="panel circuit-real-world">
        <div className="panel-heading"><div><h2><Rotate3D size={18} />Entorno real en 3D</h2><p>Relieve, edificios y zonas naturales del lugar del circuito.</p></div>
            <button type="button" className="secondary" disabled={loading} onClick={() => void loadEnvironment()}>
                <Mountain size={16} />{loading ? 'Cargando terreno y edificios…' : environment ? 'Actualizar entorno' : 'Cargar entorno real'}
            </button>
        </div>
        {error && <p className="circuit-real-world-error" role="alert">{error}</p>}
        {environment && <div className="circuit-real-world-frame">
            <canvas ref={canvas} aria-label={`Vista 3D del terreno y edificios alrededor del circuito ${track.name}`} />
            {!rendererReady && <div className="circuit-real-world-loading" role="status">Preparando el modelo 3D…</div>}
            <span className="circuit-real-world-controls">Arrastra para girar · rueda para acercar</span>
        </div>}
        <p className="circuit-real-world-note"><Building2 size={14} /> Edificios y zonas del mapa: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>. Relieve Copernicus (~90 m) vía <a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noreferrer">Open-Meteo</a>. Necesita conexión; la altura del terreno es aproximada.</p>
    </section>;
}
