import type{StyleSpecification}from'maplibre-gl';
const tile=import.meta.env.VITE_MAP_TILE_URL??'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const pinoryMapStyle:StyleSpecification={version:8,sources:{osm:{type:'raster',tiles:[tile],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'paper',type:'background',paint:{'background-color':'#ebe6dc'}},{id:'osm',type:'raster',source:'osm',paint:{'raster-saturation':-.55,'raster-contrast':.06,'raster-brightness-min':.18,'raster-brightness-max':.98}}]};
