import{useEffect,useRef,useState}from'react';
import maplibregl,{type Map as MapLibreMap}from'maplibre-gl';
import{ArrowLeft,Check,MapPin}from'lucide-react';
import{motion}from'motion/react';
import type{Coordinates}from'@pinory/shared';
import{pinoryMapStyle}from'../lib/mapStyle';
import{telegram}from'../lib/telegram';

export function CoordinatePicker({initial,onCancel,onConfirm}:{initial:Coordinates;onCancel:()=>void;onConfirm:(coordinates:Coordinates)=>void}){
  const container=useRef<HTMLDivElement>(null);const mapRef=useRef<MapLibreMap|null>(null);const[current,setCurrent]=useState(initial);
  useEffect(()=>{if(!container.current)return;const map=new maplibregl.Map({container:container.current,style:pinoryMapStyle,center:[initial.lng,initial.lat],zoom:15,attributionControl:false});map.addControl(new maplibregl.AttributionControl({compact:true}));map.on('move',()=>{const center=map.getCenter();setCurrent({lat:center.lat,lng:center.lng});});mapRef.current=map;return()=>map.remove();},[]);
  return <motion.section className="coordinate-picker" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}} transition={{type:'spring',stiffness:320,damping:30}}>
    <div ref={container} className="coordinate-map"/><div className="coordinate-shade"/><header><button className="glass-button" onClick={onCancel}><ArrowLeft/>Назад</button><div><span>Выбор точки</span><small>Двигайте карту под меткой</small></div></header>
    <div className="fixed-pin"><span><MapPin/></span><i/></div>
    <footer><div><MapPin/><span><strong>{current.lat.toFixed(5)}, {current.lng.toFixed(5)}</strong><small>Координаты сохранятся вместе с местом</small></span></div><button className="primary full" onClick={()=>{telegram.haptic('success');onConfirm(current)}}><Check/>Выбрать эту точку</button></footer>
  </motion.section>;
}
