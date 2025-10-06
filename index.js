require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

console.log('🚀 Запускаем GymProgress на Railway...');

// Проверяем наличие токена
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не установлен!');
  process.exit(1);
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  polling: true
});

console.log('✅ Бот запущен в режиме polling на Railway');

// Хранилище данных
const userData = new Map();
const activeTimers = new Map();

// Обработчик /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name || 'друг';
  
  console.log(`👋 Пользователь ${userName} (${userId}) запустил бота`);
  
  if (!userData.has(userId)) {
    userData.set(userId, {
      workouts: [],
      state: 'questionnaire_gender',
      profile: {}
    });
    
    // Начинаем анкету
    startQuestionnaire(chatId, userId, userName);
    return;
  }
  
  userData.get(userId).state = 'menu';
  showMainMenu(chatId, userName);
});

// Функция анкетирования
function startQuestionnaire(chatId, userId, userName) {
  bot.sendMessage(chatId,
    `👋 Привет, ${userName}! Давайте создадим ваш профиль!\n\n` +
    'Сначала укажите ваш пол:',
    {
      reply_markup: {
        keyboard: [
          ['👨 Мужской'],
          ['👩 Женский']
        ],
        resize_keyboard: true
      }
    }
  );
}

// Главное меню
function showMainMenu(chatId, userName, customMessage = null) {
  const message = customMessage || `💪 Привет, ${userName}! GymProgress готов к работе!`;
  
  const options = {
    reply_markup: {
      keyboard: [
        ['🏋️ Начать тренировку'],
        ['➕ Создать тренировку'],
        ['📋 Мои тренировки'],
        ['⏱️ Таймер упражнений']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, message, options);
}

// Обработчики выбора пола
bot.onText(/👨 Мужской/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (user && user.state === 'questionnaire_gender') {
    user.profile.gender = 'male';
    user.state = 'questionnaire_weight';
    
    bot.sendMessage(chatId,
      '📊 Отлично! Теперь укажите ваш текущий вес (в кг):\n' +
      'Пример: 75.5',
      {
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
  }
});

bot.onText(/👩 Женский/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (user && user.state === 'questionnaire_gender') {
    user.profile.gender = 'female';
    user.state = 'questionnaire_weight';
    
    bot.sendMessage(chatId,
      '📊 Отлично! Теперь укажите ваш текущий вес (в кг):\n' +
      'Пример: 65.5',
      {
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
  }
});

// Добавьте сюда остальные обработчики из вашего оригинального кода
// [ВСТАВЬТЕ ВАШИ ОСТАЛЬНЫЕ ФУНКЦИИ И ОБРАБОТЧИКИ]

// Простой HTTP сервер для здоровья (требуется Railway)
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'Bot is running on Railway!', 
    timestamp: new Date().toISOString()
  }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTP сервер запущен на порту ${PORT}`);
});

console.log('🎉 Бот полностью готов к работе на Railway!');
