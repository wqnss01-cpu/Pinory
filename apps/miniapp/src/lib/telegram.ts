type Theme='light'|'dark';
export interface TelegramAdapter {initData:string;user?:TelegramWebAppUser;theme:Theme;startParam?:string;ready():void;haptic(type?:'light'|'medium'|'success'|'error'):void;share(url:string,text:string):void;location():Promise<{lat:number;lng:number;accuracy?:number}>;}
export function createTelegramAdapter():TelegramAdapter{const webApp=window.Telegram?.WebApp;return{
  initData:webApp?.initData??'',user:webApp?.initDataUnsafe?.user,theme:webApp?.colorScheme??(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),startParam:webApp?.initDataUnsafe?.start_param,
  ready(){webApp?.ready();webApp?.expand();},
  haptic(type='light'){if(type==='success'||type==='error')webApp?.HapticFeedback?.notificationOccurred(type);else webApp?.HapticFeedback?.impactOccurred(type);},
  share(url,text){const link=`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;if(webApp)webApp.openTelegramLink(link);else window.open(link,'_blank','noopener,noreferrer');},
  location(){return new Promise((resolve,reject)=>{const fallback=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition((p)=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),reject,{enableHighAccuracy:true,timeout:12000,maximumAge:30000}):reject(new Error('Геолокация недоступна'));if(webApp?.LocationManager){webApp.LocationManager.init(()=>webApp.LocationManager!.getLocation((l)=>l?resolve({lat:l.latitude,lng:l.longitude}):fallback()));}else fallback();});}
};}
export const telegram=createTelegramAdapter();
