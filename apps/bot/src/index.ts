import 'dotenv/config';
import { Bot,InlineKeyboard } from 'grammy';

const token=process.env.TELEGRAM_BOT_TOKEN;const appUrl=process.env.TELEGRAM_MINI_APP_URL??'http://localhost:5173';
if(!token)throw new Error('TELEGRAM_BOT_TOKEN не задан');
const bot=new Bot(token);
const openKeyboard=(path='')=>new InlineKeyboard().webApp('Открыть Pinory',`${appUrl}${path}`);
bot.command('start',async(ctx)=>{const referral=ctx.match?`?ref=${encodeURIComponent(ctx.match)}`:'';await ctx.reply('Pinory — твой живой атлас мест. Сохраняй воспоминания, желания и находки друзей.',{reply_markup:openKeyboard(referral)});});
bot.command('map',(ctx)=>ctx.reply('Открываю твою карту 🗺️',{reply_markup:openKeyboard('/')}));
bot.command('profile',(ctx)=>ctx.reply('Твой профиль Pinory',{reply_markup:openKeyboard('/profile')}));
bot.command('help',(ctx)=>ctx.reply('Отмечай места вручную в Mini App. Геолокация используется только пока приложение открыто. Команды: /map, /profile, /location, /stoplocation.'));
bot.command('location',(ctx)=>ctx.reply('Фоновое отслеживание появится в версии 2 и всегда будет добровольным. В версии 1 можно определить позицию внутри открытого Mini App.'));
bot.command('stoplocation',(ctx)=>ctx.reply('Фоновое отслеживание сейчас не ведётся.'));
bot.catch((error)=>console.error('Pinory bot error',error));bot.start({onStart:()=>console.log('Pinory bot started')});
