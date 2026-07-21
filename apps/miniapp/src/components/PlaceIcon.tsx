import type{ComponentType}from'react';
import type{LucideProps}from'lucide-react';
import{MapPin,Leaf,Waves,Mountain,Sun,TreePine,Trees,Utensils,Coffee,Martini,Hotel,Landmark,Castle,History,FerrisWheel,Dumbbell,Ticket,ShoppingBag,TrainFront,Telescope,Camera,Heart,UsersRound,Star}from'lucide-react';

const icons:Record<string,ComponentType<LucideProps>>={
  pin:MapPin,other:MapPin,nature:Leaf,waterfall:Waves,lake:Waves,mountain:Mountain,beach:Sun,forest:TreePine,park:Trees,
  restaurant:Utensils,cafe:Coffee,bar:Martini,hotel:Hotel,museum:Landmark,architecture:Castle,history:History,fun:FerrisWheel,
  sport:Dumbbell,event:Ticket,shopping:ShoppingBag,transport:TrainFront,viewpoint:Telescope,photo:Camera,romantic:Heart,family:UsersRound,favorite:Star
};
export function PlaceIcon({code,...props}:{code:string}&LucideProps){const Icon=icons[code]??MapPin;return <Icon aria-hidden="true" {...props}/>;}
