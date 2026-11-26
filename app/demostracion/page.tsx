import type { Metadata } from 'next';
import Demonstration from './demonstration';

export const metadata: Metadata = {
    title: 'Competición del simulador · MGRT',
};

export default function Page() {
    return (
        <main className="simulator-demonstration">
            <header className="page-heading">
                <div>
                    <h1>Competición del simulador</h1>
                    <p>Inscríbete y consigue tu mejor vuelta válida para la clasificación.</p>
                </div>
                <a href="/" className="secondary">Volver a la web del equipo</a>
            </header>
            <Demonstration />
        </main>
    );
}
