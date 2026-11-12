'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Keyboard, Pause, Play, RotateCcw } from 'lucide-react';
import { createCircuitRuntime, DEMO_TRACK } from '../lib/circuits';
import { FIXED_STEP, OFF_TRACK_RESET_SECONDS, createRaceWorld, keyboardDrivingInput, stepPlayerCar, type DrivingInput } from '../lib/race-engine';
import { setActiveCircuit } from '../lib/circuit-storage';
import { useCircuits } from './use-circuits';

type ControlMode = 'keyboard' | 'wheel';
const EMPTY_INPUT: DrivingInput = { throttle: 0, brake: 0, steering: 0 };
const lapTime = (seconds: number | null) => seconds === null
    ? '—'
    : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

function isTypingTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function readWheelInput(): { input: DrivingInput; name: string | null } {
    const pads = navigator.getGamepads?.();
    if (!pads) return { input: EMPTY_INPUT, name: null };
    const pad = Array.from(pads).find((candidate): candidate is Gamepad => !!candidate?.connected);
    if (!pad) return { input: EMPTY_INPUT, name: null };
    const axis = pad.axes[0] ?? 0;
    const throttleButton = pad.buttons[7]?.value ?? 0;
    const brakeButton = pad.buttons[6]?.value ?? 0;
    const trigger = (value: number | undefined) => value === undefined || Math.abs(value) < .04 ? 0 : value < 0 ? (value + 1) / 2 : value;
    const throttleAxis = pad.mapping === 'standard' ? 0 : trigger(pad.axes[2]);
    const brakeAxis = pad.mapping === 'standard' ? 0 : trigger(pad.axes[3]);
    return {
        input: {
            steering: Math.abs(axis) < .04 ? 0 : -Math.max(-1, Math.min(1, axis)),
            throttle: Math.max(throttleButton, throttleAxis),
            brake: Math.max(brakeButton, brakeAxis),
        },
        name: pad.id || 'Volante / mando',
    };
}

export default function Simulator({ onManageCircuits }: { onManageCircuits: () => void }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [world, setWorld] = useState(() => createRaceWorld(DEMO_TRACK));
    const worldRef = useRef(world);
    const keys = useRef(new Set<string>());
    const library = useCircuits();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<ControlMode>('keyboard');
    const [running, setRunning] = useState(true);
    const [wheelName, setWheelName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const track = useMemo(() => {
        const effectiveId = selectedId ?? library.activeId;
        const definition = library.circuits.find(circuit => circuit.id === effectiveId);
        return definition ? createCircuitRuntime(definition) : DEMO_TRACK;
    }, [library.activeId, library.circuits, selectedId]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const initial = createRaceWorld(track);
            worldRef.current = initial;
            setWorld(initial);
        });
        return () => cancelAnimationFrame(frame);
    }, [track]);

    useEffect(() => {
        const down = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target)) return;
            const key = event.key.toLowerCase();
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) {
                event.preventDefault();
                keys.current.add(key);
            }
        };
        const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
        const clear = () => keys.current.clear();
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', clear);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', clear);
            clear();
        };
    }, []);

    useEffect(() => {
        const connected = (event: GamepadEvent) => setWheelName(event.gamepad.id || 'Volante / mando');
        const disconnected = () => setWheelName(readWheelInput().name);
        window.addEventListener('gamepadconnected', connected);
        window.addEventListener('gamepaddisconnected', disconnected);
        return () => {
            window.removeEventListener('gamepadconnected', connected);
            window.removeEventListener('gamepaddisconnected', disconnected);
        };
    }, []);

    useEffect(() => {
        let animation = 0, previous = performance.now(), published = previous;
        let accumulator = 0, active = true;
        let scene: ReturnType<typeof import('../lib/race-3d').createRaceScene> | undefined;
        const node = canvas.current;
        if (!node) return;
        import('../lib/race-3d').then(module => {
            if (!active) return;
            try {
                scene = module.createRaceScene(node, track);
                const draw = (now: number) => {
                    if (!active) return;
                    const delta = Math.min(.1, Math.max(0, (now - previous) / 1000));
                    previous = now;
                    if (running) {
                        accumulator += delta;
                        while (accumulator >= FIXED_STEP) {
                            const input = mode === 'wheel' ? readWheelInput().input : keyboardDrivingInput(keys.current);
                            const elapsed = worldRef.current.elapsed + FIXED_STEP;
                            const nextCar = stepPlayerCar(worldRef.current.cars[0], input, FIXED_STEP, track, elapsed);
                            if (nextCar.offTrack && (nextCar.offTrackSeconds ?? 0) >= OFF_TRACK_RESET_SECONDS) {
                                const initial = createRaceWorld(track);
                                worldRef.current = initial;
                                setWorld(initial);
                                keys.current.clear();
                                accumulator = 0;
                                break;
                            }
                            worldRef.current = { elapsed, cars: [nextCar, worldRef.current.cars[1]] };
                            accumulator -= FIXED_STEP;
                        }
                    }
                    if (now - published >= 80) {
                        setWorld(worldRef.current);
                        if (mode === 'wheel') setWheelName(readWheelInput().name);
                        published = now;
                    }
                    try {
                        scene?.render(worldRef.current, 'player', delta);
                    } catch {
                        setError('No se pudo dibujar la vista 3D. Comprueba que el navegador permite WebGL.');
                        active = false;
                        return;
                    }
                    animation = requestAnimationFrame(draw);
                };
                animation = requestAnimationFrame(draw);
            } catch {
                setError('No se pudo iniciar el coche 3D. Comprueba que el navegador permite WebGL.');
            }
        }).catch(() => setError('No se pudo cargar el módulo de simulación 3D.'));
        return () => {
            active = false;
            cancelAnimationFrame(animation);
            scene?.dispose();
        };
    }, [track, mode, running]);

    function chooseTrack(id: string) {
        setSelectedId(id);
        setError('');
        try {
            const definition = library.circuits.find(circuit => circuit.id === id);
            const nextTrack = definition ? createCircuitRuntime(definition) : DEMO_TRACK;
            const initial = createRaceWorld(nextTrack);
            worldRef.current = initial;
            setWorld(initial);
            if (id !== 'demo') setActiveCircuit(id);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo seleccionar la pista.');
        }
    }

    function reset() {
        const initial = createRaceWorld(track);
        worldRef.current = initial;
        setWorld(initial);
    }

    const player = world.cars[0];
    const speed = Math.round(player.speed * 3.6);
    const progress = (player.distance % track.length) / track.length;
    const offTrack = player.offTrack ?? Math.abs(player.lane) > track.width / 2 + .4;
    const offTrackCountdown = Math.max(0, OFF_TRACK_RESET_SECONDS - (player.offTrackSeconds ?? 0));
    const currentLapTime = Math.max(0, world.elapsed - player.lapStarted);

    return <div className="simulator">
        <section className="panel simulator-setup">
            <label htmlFor="simulator-track">Tu pista
                <select id="simulator-track" value={track.id} disabled={library.loading} onChange={event => chooseTrack(event.target.value)}>
                    <option value="demo">Circuito de demostración</option>
                    {library.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}
                </select>
            </label>
            <div className="simulator-track-facts"><strong>{Math.round(track.length).toLocaleString('es-ES')} m</strong><span>{track.name} · Coche Greenpower blanco</span></div>
            <button type="button" className="secondary" onClick={onManageCircuits}>Crear / editar pista</button>
        </section>
        {(error || library.error) && <p className="notice" role="alert">{error || library.error}</p>}
        <section className="panel simulator-game" aria-label="Minijuego de conducción Greenpower">
            <div className="simulator-screen">
                <canvas ref={canvas} aria-label="Cámara libre del coche Greenpower: arrastra para girar y usa la rueda para acercar o alejar" />
                <div className="simulator-hud"><span>VUELTA {Math.floor(player.distance / track.length) + 1}</span><strong>{speed}<small> km/h</small></strong><span className={offTrack ? 'off-track' : ''}>{offTrack ? 'FUERA DE PISTA' : `${Math.floor(progress * 100)} %`}</span></div>
                {offTrack && <div className="simulator-off-track-alert" role="alert">
                    <strong>¡Has salido de la pista!</strong>
                    <span aria-live="off">La carrera se reinicia en {offTrackCountdown.toFixed(1)} s. Vuelve al trazado para cancelar.</span>
                </div>}
                <div className="simulator-lap-timing" aria-label="Tiempos de vuelta">
                    <div><span>VUELTA ACTUAL</span><strong>{lapTime(currentLapTime)}</strong></div>
                    <div><span>ÚLTIMA VUELTA</span><strong>{lapTime(player.lastLap)}</strong></div>
                    <div><span>MEJOR VUELTA</span><strong>{lapTime(player.bestLap)}</strong></div>
                </div>
                <div className="simulator-screen-title">CÁMARA LIBRE · ARRASTRA PARA GIRAR · RUEDA PARA ZOOM</div>
                {!running && <div className="simulator-paused">PAUSA</div>}
            </div>
            <div className="simulator-dashboard">
                <div className="simulator-controls">
                    <div className="simulator-control-modes" role="group" aria-label="Modo de conducción">
                        <button type="button" className={mode === 'keyboard' ? 'selected' : ''} aria-pressed={mode === 'keyboard'} onClick={() => setMode('keyboard')}><Keyboard size={17} />Teclado</button>
                        <button type="button" className={mode === 'wheel' ? 'selected' : ''} aria-pressed={mode === 'wheel'} onClick={() => setMode('wheel')}><Gamepad2 size={17} />Volante Logitech / Gamepad</button>
                    </div>
                    {mode === 'keyboard'
                        ? <p className="simulator-control-hint"><kbd>↑</kbd> acelerar · <kbd>↓</kbd> frenar · <kbd>←</kbd> girar a la izquierda · <kbd>→</kbd> girar a la derecha <span>También puedes usar W A S D y espacio para frenar. Si sales de la pista, vuelve al trazado antes de que termine la cuenta atrás de 5 segundos.</span></p>
                        : <p className="simulator-control-hint"><Gamepad2 size={16} />{wheelName ? `Detectado: ${wheelName}. Gira el volante y usa los pedales.` : 'Conecta el volante por USB y pulsa un botón o mueve el volante para que el navegador lo detecte.'}<span>Eje horizontal: dirección · pedal derecho / gatillo: acelerar · pedal izquierdo / gatillo: frenar.</span></p>}
                </div>
                <div className="simulator-actions">
                    <button type="button" className="primary" onClick={() => setRunning(value => !value)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pausar' : 'Conducir'}</button>
                    <button type="button" className="secondary" onClick={reset}><RotateCcw size={17} />Reiniciar</button>
                </div>
            </div>
            <div className="simulator-progress"><span>Progreso de vuelta</span><progress max={1} value={progress} /><span>{Math.floor(progress * 100)} %</span></div>
        </section>
        <p className="race-media-note">Conducción libre: acelerador, freno y dirección controlan el movimiento del coche. Si permanece fuera de la pista durante 5 segundos, ambos coches y la carrera se reinician desde cero. Arrastra sobre la imagen para orbitar la cámara y usa la rueda para acercar o alejar. No conecta con el vehículo real.</p>
    </div>;
}
