import { validateCircuit, type CircuitDefinition } from './circuits';

const EVENT = 'mgrt-circuits-changed';
const ACTIVE = 'mgrt-active-circuit';
function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador no permite guardar circuitos localmente. Puedes exportar el archivo para conservarlo.')); return; }
        const request = indexedDB.open('mgrt-circuits', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('circuits', { keyPath: 'id' });
        request.onerror = () => reject(new Error('No se pudo abrir la biblioteca de circuitos.'));
        request.onblocked = () => reject(new Error('Cierra las otras pestañas de la web para actualizar la biblioteca de circuitos.'));
        request.onsuccess = () => resolve(request.result);
    });
}

export async function listCircuits(): Promise<CircuitDefinition[]> {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction('circuits', 'readonly');
            const request = transaction.objectStore('circuits').getAll();
            request.onsuccess = () => resolve((request.result as CircuitDefinition[]).sort((a,b) => a.name.localeCompare(b.name, 'es')));
            request.onerror = () => reject(new Error('No se pudieron leer los circuitos guardados.'));
        });
    } finally { db.close(); }
}

export async function saveCircuit(value: CircuitDefinition) {
    const circuit = validateCircuit(value), db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('circuits', 'readwrite');
            transaction.objectStore('circuits').put(circuit);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(new Error('No se pudo guardar el circuito. Comprueba el espacio disponible del navegador y exporta una copia.'));
            transaction.onabort = transaction.onerror;
        });
    } finally { db.close(); }
    window.dispatchEvent(new Event(EVENT));
}

export async function deleteCircuit(id: string) {
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('circuits', 'readwrite'); transaction.objectStore('circuits').delete(id);
            transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(new Error('No se pudo eliminar el circuito.')); transaction.onabort = transaction.onerror;
        });
    } finally { db.close(); }
    if (getActiveCircuit() === id) setActiveCircuit('demo');
    window.dispatchEvent(new Event(EVENT));
}

export function getActiveCircuit() { try { return localStorage.getItem(ACTIVE) ?? 'demo'; } catch { return 'demo'; } }
export function setActiveCircuit(id: string) {
    try { localStorage.setItem(ACTIVE, id); } catch { throw new Error('El navegador no permite recordar la selección del circuito.'); }
    window.dispatchEvent(new Event(EVENT));
}
export function subscribeCircuits(callback: () => void) {
    window.addEventListener(EVENT, callback); window.addEventListener('storage', callback);
    return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
}
