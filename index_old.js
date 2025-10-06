require('dotenv').config();
const { Telegraf } = require('telegraf');

console.log('🚀 Запускаем GymProgress с Telegraf...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Хранилище данных
const userData = new Map();

// Обработчик /start
bot.start((ctx) => {
  const userId = ctx.from.id;
  
  if (!userData.has(userId)) {
    userData.set(userId, {
      workouts: [],
      state: 'menu'
    });
  }
  
  userData.get(userId).state = 'menu';
  
  const keyboard = [
    ['🏋️ Начать тренировку'],
    ['➕ Создать тренировку']
  ];
  
  ctx.reply('Добро пожаловать в GymProgress! 🏋️‍♂️', {
    reply_markup: { keyboard, resize_keyboard: true }
  });
});

// Запуск бота с обработкой ошибок
bot.launch({
  polling: {
    allowedUpdates: ['message', 'callback_query'],
    timeout: 30,
    limit: 100
  }
}).then(() => {
  console.log('✅ Бот запущен');
  console.log('🎉 Бот готов к работе!');
  console.log('📱 Напишите /start в Telegram');
}).catch(err => {
  console.error('❌ Ошибка запуска:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
