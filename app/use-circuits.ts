'use client';
import { useEffect, useState } from 'react';
import { getActiveCircuit, listCircuits, subscribeCircuits } from '../lib/circuit-storage';
import type { CircuitDefinition } from '../lib/circuits';

export function useCircuits() {
    const [state, setState] = useState<{ loading: boolean; circuits: CircuitDefinition[]; activeId: string; error: string }>({ loading: true, circuits: [], activeId: 'demo', error: '' });
    useEffect(() => {
        let active = true, request = 0;
        const load = async () => {
            const id = ++request;
            try { const circuits = await listCircuits(); if (active && id === request) setState({ loading: false, circuits, activeId: getActiveCircuit(), error: '' }); }
            catch (error) { if (active && id === request) setState(old => ({ ...old, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar la biblioteca.' })); }
        };
        void load(); const unsubscribe = subscribeCircuits(() => { void load(); });
        return () => { active = false; unsubscribe(); };
    }, []);
    return state;
}
