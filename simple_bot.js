require('dotenv').config();
const { Telegraf } = require('telegraf');

console.log('🤖 Тестовый бот запускается...');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  console.log('Получен /start от:', ctx.from.id);
  ctx.reply('Тестовый бот работает! ✅');
});

bot.on('message', (ctx) => {
  console.log('Получено сообщение:', ctx.message.text);
  ctx.reply('Получил: ' + ctx.message.text);
});

bot.launch().then(() => {
  console.log('✅ Бот запущен! Пишите /start в Telegram');
}).catch(err => {
  console.error('❌ Ошибка:', err);
});

// Обработка завершения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
