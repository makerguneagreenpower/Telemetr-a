'use client';

import { useEffect, useRef, useState } from 'react';
import type { CircuitPoint, CircuitDefinition } from '../lib/circuits';

export type DrawingTool = 'trace' | 'calibrate' | 'select';
type Props = {
    mode: 'image' | 'map'; image?: CircuitDefinition['referenceImage']; points: CircuitPoint[];
    calibration: CircuitPoint[]; tool: DrawingTool; selected: number | null; fitVersion: number;
    center: { lat: number; lng: number; revision: number };
    onAdd: (point: CircuitPoint) => void; onMove: (index: number, point: CircuitPoint) => void;
    onSelect: (index: number) => void; onCalibrate: (point: CircuitPoint) => void;
};

export default function CircuitDrawingMap(props: Props) {
    const node = useRef<HTMLDivElement>(null), map = useRef<import('leaflet').Map | null>(null);
    const leaflet = useRef<typeof import('leaflet') | null>(null), layers = useRef<import('leaflet').LayerGroup | null>(null);
    const latest = useRef(props);
    const [ready, setReady] = useState(0), [error, setError] = useState('');
    useEffect(() => { latest.current = props; }, [props]);
    const { mode, image, points, calibration, tool, selected, fitVersion, center } = props;

    useEffect(() => {
        let active = true;
        import('leaflet').then(L => {
            if (!active || !node.current) return;
            setError('');
            leaflet.current = L;
            const m = L.map(node.current, { crs: mode === 'image' ? L.CRS.Simple : L.CRS.EPSG3857, minZoom: mode === 'image' ? -5 : 2, maxZoom: mode === 'image' ? 5 : 20, doubleClickZoom: false, zoomControl: true, zoomSnap: mode==='image'?.1:1 }); map.current = m;
            if (mode === 'image' && image) { L.imageOverlay(image.dataUrl, [[0,0],[image.height,image.width]]).addTo(m); m.fitBounds([[0,0],[image.height,image.width]], { padding:[15,15] }); }
            else { L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19 }).on('tileerror', () => { if(active) setError('Mapa base no disponible. El trazado y los puntos siguen siendo editables.'); }).addTo(m); m.setView([latest.current.center.lat,latest.current.center.lng],16); L.control.scale({ imperial:false }).addTo(m); }
            layers.current = L.layerGroup().addTo(m);
            m.on('click', event => {
                const p = latest.current, point = p.mode === 'image' ? { x:event.latlng.lng, z:(p.image?.height ?? 0)-event.latlng.lat } : { x:event.latlng.lng, z:event.latlng.lat };
                if(p.mode==='image' && p.image && (point.x<0||point.z<0||point.x>p.image.width||point.z>p.image.height)) return;
                if(p.tool==='calibrate') p.onCalibrate(point); else if(p.tool==='trace') p.onAdd(point);
            });
            const resize = new ResizeObserver(() => { if(active) m.invalidateSize(); }); resize.observe(node.current); m.once('unload',()=>resize.disconnect());
            setReady(value => value + 1);
        }).catch(() => { if(active) setError('No se pudo abrir el editor del mapa. Recarga la página.'); });
        return () => { active=false; map.current?.remove(); map.current=null; layers.current=null; };
    }, [mode, image]);

    useEffect(() => {
        const L=leaflet.current, m=map.current, group=layers.current;
        if(!ready||!L||!m||!group) return;
        group.clearLayers();
        const latlng=(p:CircuitPoint):[number,number] => mode==='image'?[(image?.height??0)-p.z,p.x]:[p.z,p.x];
        if(points.length>1) L.polyline(points.map(latlng),{color:'#d5283d',weight:3}).addTo(group);
        if(points.length>2) L.polyline([latlng(points[points.length-1]),latlng(points[0])],{color:'#d5283d',weight:3,dashArray:'5 5'}).addTo(group);
        points.forEach((point,index)=>{
            const marker=L.marker(latlng(point),{draggable:tool!=='calibrate',icon:L.divIcon({className:'circuit-vertex-icon',iconSize:[24,24],iconAnchor:[12,12],html:`<span class="${selected===index?'selected ':''}${index===0?'start':''}">${index===0?'M':index+1}</span>`})}).addTo(group);
            marker.on('click',event=>{L.DomEvent.stopPropagation(event.originalEvent);latest.current.onSelect(index);});
            marker.on('dragend',()=>{const p=marker.getLatLng();latest.current.onMove(index,mode==='image'?{x:p.lng,z:(image?.height??0)-p.lat}:{x:p.lng,z:p.lat});});
        });
        calibration.forEach((point,index)=>L.marker(latlng(point),{icon:L.divIcon({className:'circuit-calibration-icon',iconSize:[26,26],iconAnchor:[13,13],html:`<span>${index===0?'A':'B'}</span>`}),interactive:false}).addTo(group));
        if(calibration.length===2) L.polyline(calibration.map(latlng),{color:'#2b79c2',weight:2,dashArray:'4 4'}).addTo(group);
    },[ready,points,calibration,tool,selected,mode,image]);

    useEffect(()=>{
        const m=map.current,L=leaflet.current;if(!ready||!m||!L)return;
        const p=latest.current;
        if(p.points.length>1)m.fitBounds(L.latLngBounds(p.points.map(point=>p.mode==='image'?[(p.image?.height??0)-point.z,point.x] as [number,number]:[point.z,point.x] as [number,number])),{padding:[35,35],maxZoom:p.mode==='image'?4:19});
        else if(p.mode==='image'&&p.image)m.fitBounds([[0,0],[p.image.height,p.image.width]],{padding:[15,15]});
    },[ready,fitVersion]);
    useEffect(()=>{if(mode==='map')map.current?.setView([center.lat,center.lng],17);},[mode,center]);

    return <div className={`circuit-drawing-surface tool-${tool}`}><div ref={node} className="circuit-leaflet-map" role="region" aria-label={mode==='image'?'Editor de recorrido sobre la imagen':'Editor de recorrido sobre el mapa'} />{error&&<p className="circuit-map-error" role="status">{error}</p>}<div className="circuit-map-instruction">{tool==='calibrate'?'Marca los extremos A y B de una distancia conocida':tool==='trace'?'Pulsa para añadir puntos · arrastra para ajustar':'Selecciona un punto · arrastra para ajustar'}<span>M = meta · línea discontinua = cierre</span></div></div>;
}
