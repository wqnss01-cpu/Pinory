export type TelegramStartTarget={appPath:string;buttonLabel:string;intro:string};const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;const valid=/^[A-Za-z0-9_-]{1,64}$/;
export const PINORY_GUIDE=`<b>Pinory — твой живой атлас мест.</b>

Сохраняй воспоминания, желания и находки друзей.

📍 Отмечай посещённые места и планы
🗺️ Собирай личную карту и совместные подборки
👥 Сравнивай маршруты и находи общие места
🏆 Открывай достижения за качественные истории

Нажми кнопку ниже, чтобы открыть Pinory.

🧪 <b>Альфа-версия</b> размещена на бесплатных серверах Render. Первый запуск после паузы иногда занимает до минуты.`;
export function parseTelegramStartPayload(payload?:string):TelegramStartTarget{const targets:[string,string,string,string][]=[['entry_','entry','Открыть место','📍 Тебе поделились воспоминанием в Pinory.'],['collection_','collection','Открыть подборку','🗺️ Тебя приглашают посмотреть маршрут в Pinory.'],['trip_','collection','Открыть поездку','🧳 Тебя приглашают в совместную поездку.'],['profile_','profile','Открыть атлас','👋 Тебе поделились личным атласом Pinory.'],['compare_','compare','Сравнить карты','🤝 Друг предлагает сравнить ваши путешествия.']];for(const[prefix,param,button,intro]of targets)if(payload?.startsWith(prefix)){const id=payload.slice(prefix.length);if(uuid.test(id))return{appPath:`?${param}=${encodeURIComponent(id)}`,buttonLabel:button,intro}}if(payload?.startsWith('ref_')&&valid.test(payload))return{appPath:`?ref=${encodeURIComponent(payload)}`,buttonLabel:'Принять приглашение',intro:'👋 Друг приглашает тебя в Pinory — создавайте общую карту воспоминаний.'};return{appPath:'',buttonLabel:'Открыть Pinory',intro:''}}
export function buildStartMessage(payload?:string){const target=parseTelegramStartPayload(payload);return target.intro?`${target.intro}\n\n${PINORY_GUIDE}`:PINORY_GUIDE}export function buildTelegramBotLink(username:string,start:string){if(!/^[A-Za-z0-9_]{5,32}$/.test(username))throw new Error('Telegram bot username is invalid');if(!valid.test(start))throw new Error('Telegram start parameter is invalid');return`https://t.me/${username}?start=${encodeURIComponent(start)}`}
