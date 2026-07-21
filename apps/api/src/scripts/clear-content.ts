import { env } from '../env.js';
import { pool } from '../db.js';

if(env.NODE_ENV==='production')throw new Error('Очистка данных запрещена в production');
if(process.env.CONFIRM_CLEAR_LOCAL_DATA!=='YES')throw new Error('Для очистки локальных данных задайте CONFIRM_CLEAR_LOCAL_DATA=YES');
await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
console.log('✓ Локальные пользователи, места, отметки, подборки и связанный контент удалены');
await pool.end();
