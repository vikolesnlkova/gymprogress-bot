require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

console.log('🚀 Запускаем GymProgress...');

// Улучшенные настройки для стабильности
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// Обработка ошибок polling
bot.on('polling_error', (error) => {
  console.log('Polling error:', error.code);
  // Автоматически перезапускаем при ошибках
  setTimeout(() => {
    bot.startPolling();
  }, 5000);
});

bot.on('webhook_error', (error) => {
  console.log('Webhook error:', error);
});

console.log('✅ Бот запущен');

// Хранилище данных
const userData = new Map();
const activeTimers = new Map(); // userId -> timerData

// База знаний упражнений с рекомендуемыми весами (в % от веса тела)
const exerciseWeights = {
  'Жим штанги лежа': { beginner: 0.45, intermediate: 0.68, advanced: 0.92 },
  'Приседания со штангой': { beginner: 0.55, intermediate: 0.82, advanced: 1.15 },
  'Становая тяга': { beginner: 0.65, intermediate: 0.95, advanced: 1.35 },
  'Жим гантелей сидя': { beginner: 0.18, intermediate: 0.27, advanced: 0.36 },
  'Тяга штанги в наклоне': { beginner: 0.35, intermediate: 0.52, advanced: 0.72 },
  'Подтягивания': { beginner: 0.0, intermediate: 0.0, advanced: 0.0 },
  'Отжимания': { beginner: 0.0, intermediate: 0.0, advanced: 0.0 },
  'Выпады с гантелями': { beginner: 0.12, intermediate: 0.22, advanced: 0.32 },
  'Жим ногами': { beginner: 0.8, intermediate: 1.2, advanced: 1.6 },
  'Сгибания рук со штангой': { beginner: 0.15, intermediate: 0.25, advanced: 0.35 }
};

// Функция рекомендации веса
function recommendWeight(exerciseName, userWeight, experienceLevel) {
  const exercise = exerciseWeights[exerciseName];
  if (!exercise) {
    // Для неизвестных упражнений даем общую рекомендацию
    const generalPercentages = { beginner: 0.2, intermediate: 0.3, advanced: 0.4 };
    return userWeight * generalPercentages[experienceLevel];
  }
  
  const percentage = exercise[experienceLevel];
  return userWeight * percentage;
}

// Функции для работы со временем
function parseTime(timeStr) {
  if (!timeStr) return null;
  
  // Просто число - секунды
  if (/^\d+$/.test(timeStr)) {
    return parseInt(timeStr);
  }
  
  // Формат мм:сс
  if (/^\d+:\d+$/.test(timeStr)) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  
  // Формат с м и с
  if (timeStr.includes('м') || timeStr.includes('с')) {
    let seconds = 0;
    const minutesMatch = timeStr.match(/(\d+)\s*м/);
    const secondsMatch = timeStr.match(/(\d+)\s*с/);
    
    if (minutesMatch) seconds += parseInt(minutesMatch[1]) * 60;
    if (secondsMatch) seconds += parseInt(secondsMatch[1]);
    
    return seconds > 0 ? seconds : null;
  }
  
  return null;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}м ${secs}с`;
  }
  return `${secs}с`;
}

function startSingleTimer(userId, chatId, timerData) {
  if (activeTimers.has(userId)) {
    clearTimeout(activeTimers.get(userId).timeout);
  }
  
  const timer = setTimeout(() => {
    activeTimers.delete(userId);
    
    let message = `⏰ <b>Таймер завершен!</b>\n\n`;
    message += `🏋️ Упражнение: ${timerData.name}\n`;
    message += `⏰ Время: ${formatTime(timerData.duration)}\n\n`;
    message += `🎉 Отличная работа!`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    
    // Возвращаем в главное меню
    const user = userData.get(userId);
    if (user) {
      user.state = 'menu';
    }
    
  }, timerData.duration * 1000);
  
  activeTimers.set(userId, {
    timeout: timer,
    type: 'single',
    data: timerData
  });
  
  // Отправляем сообщение о запуске
  let startMessage = `🚀 <b>Таймер запущен!</b>\n\n`;
  startMessage += `🏋️ Упражнение: ${timerData.name}\n`;
  startMessage += `⏰ Время: ${formatTime(timerData.duration)}\n\n`;
  startMessage += `Я сообщу когда время выйдет! 💪`;
  
  return bot.sendMessage(chatId, startMessage, { 
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        ['⏹ Остановить таймер'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true
    }
  });
}

// Обработчик /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!userData.has(userId)) {
    userData.set(userId, {
      workouts: [],
      state: 'questionnaire',
      profile: {}
    });
    
    // Начинаем анкету (ИСПРАВЛЕННАЯ ФРАЗА)
    bot.sendMessage(chatId,
      `👋 Привет, ${msg.from.first_name}! Добро пожаловать в GymProgress! 🏋️‍♂️\n\n` +
      `Чтобы я мог давать персональные рекомендации, давай заполним небольшую анкету.\n\n` +
      `🎯 <b>Какова твоя основная цель?</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            ['💪 Набор массы', '🔥 Сушка/похудение'],
            ['🏃 Выносливость', '⚖️ Поддержание формы']
          ],
          resize_keyboard: true
        }
      }
    );
    
    return;
  }
  
  // Если пользователь уже есть, показываем обычное меню
  userData.get(userId).state = 'menu';
  
  const options = {
    reply_markup: {
      keyboard: [
        ['🏋️ Начать тренировку'],
        ['➕ Создать тренировку'],
        ['📋 Мои тренировки'],
        ['👤 Мой профиль'],
        ['⏱ Таймер упражнений']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, `💪 С возвращением, ${msg.from.first_name}!`, options);
});

// Обработчик кнопки таймера
bot.onText(/⏱ Таймер упражнений/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userData.get(userId).state = 'timer_menu';
  
  bot.sendMessage(chatId,
    '⏱ <b>Таймер упражнений</b>\n\n' +
    'Выберите тип таймера:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          ['⏰ Обычный таймер'],
          ['🔄 Интервальный таймер'], 
          ['📊 Мои шаблоны'],
          ['❌ Отмена']
        ],
        resize_keyboard: true
      }
    }
  );
});

// Обработчик обычного таймера
bot.onText(/⏰ Обычный таймер/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userData.get(userId).state = 'timer_set_name';
  userData.get(userId).timerData = { type: 'single' };
  
  bot.sendMessage(chatId,
    '📝 <b>Введите название упражнения:</b>\n\n' +
    'Пример: "Планка", "Бег на месте", "Прыжки"',
    {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    }
  );
});

// Обработчик остановки таймера
bot.onText(/⏹ Остановить таймер/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (activeTimers.has(userId)) {
    const timer = activeTimers.get(userId);
    clearTimeout(timer.timeout);
    activeTimers.delete(userId);
    
    bot.sendMessage(chatId, 
      '⏹ <b>Таймер остановлен</b>\n\n' +
      'Вы можете запустить новый таймер когда будете готовы!',
      { 
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            ['⏱ Таймер упражнений'],
            ['🏠 Главное меню']
          ],
          resize_keyboard: true
        }
      }
    );
    
    const user = userData.get(userId);
    if (user) {
      user.state = 'menu';
    }
  } else {
    bot.sendMessage(chatId, '❌ У вас нет активных таймеров');
  }
});

// Главное меню
bot.onText(/🏠 Главное меню/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userData.get(userId).state = 'menu';
  
  bot.sendMessage(chatId, '🏠 <b>Главное меню</b>', {
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        ['🏋️ Начать тренировку'],
        ['➕ Создать тренировку'],
        ['📋 Мои тренировки'],
        ['👤 Мой профиль'],
        ['⏱ Таймер упражнений']
      ],
      resize_keyboard: true
    }
  });
});

// Обработка всех сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  
  if (text.startsWith('/')) return;
  
  // Пропускаем обработку кнопок меню
  const menuButtons = [
    '🏋️ Начать тренировку', '➕ Создать тренировку', '📋 Мои тренировки',
    '👤 Мой профиль', '⏱ Таймер упражнений', '❌ Отмена', '⏰ Обычный таймер',
    '🔄 Интервальный таймер', '📊 Мои шаблоны', '⏹ Остановить таймер',
    '🏠 Главное меню', '💪 Набор массы', '🔥 Сушка/похудение', '🏃 Выносливость',
    '⚖️ Поддержание формы', '👨 Мужской', '👩 Женский', '🥊 Новичок (до 3 мес.)',
    '💥 Средний (3-12 мес.)', '🔥 Продвинутый (1+ лет)'
  ];
  
  if (menuButtons.includes(text)) return;
  
  const user = userData.get(userId);
  if (!user) return;

  // Анкета - цель тренировок
  if (user.state === 'questionnaire' && !user.profile.goal) {
    if (['💪 Набор массы', '🔥 Сушка/похудение', '🏃 Выносливость', '⚖️ Поддержание формы'].includes(text)) {
      user.profile.goal = text;
      user.state = 'questionnaire_gender';
      
      bot.sendMessage(chatId,
        '🚻 <b>Укажи свой пол:</b>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [['👨 Мужской', '👩 Женский']],
            resize_keyboard: true
          }
        }
      );
      return;
    }
  }
  
  // Анкета - пол
  if (user.state === 'questionnaire_gender') {
    if (['👨 Мужской', '👩 Женский'].includes(text)) {
      user.profile.gender = text === '👨 Мужской' ? 'male' : 'female';
      user.state = 'questionnaire_age';
      
      bot.sendMessage(chatId,
        '🎂 <b>Сколько тебе лет?</b>\n\nВведи число:',
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true }
        }
      );
      return;
    }
  }
  
  // Анкета - возраст
  if (user.state === 'questionnaire_age' && !user.profile.age) {
    const age = parseInt(text);
    if (age && age >= 10 && age <= 100) {
      user.profile.age = age;
      user.state = 'questionnaire_weight';
      
      bot.sendMessage(chatId,
        '⚖️ <b>Какой у тебя вес? (в кг)</b>\n\nПример: 75',
        { parse_mode: 'HTML' }
      );
      return;
    } else {
      bot.sendMessage(chatId, '❌ Пожалуйста, введи корректный возраст (10-100)');
      return;
    }
  }
  
  // Анкета - вес
  if (user.state === 'questionnaire_weight' && !user.profile.weight) {
    const weight = parseFloat(text);
    if (weight && weight >= 30 && weight <= 200) {
      user.profile.weight = weight;
      user.state = 'questionnaire_experience';
      
      bot.sendMessage(chatId,
        '🏆 <b>Какой у тебя опыт тренировок?</b>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [
              ['🥊 Новичок (до 3 мес.)'],
              ['💥 Средний (3-12 мес.)'],
              ['🔥 Продвинутый (1+ лет)']
            ],
            resize_keyboard: true
          }
        }
      );
      return;
    } else {
      bot.sendMessage(chatId, '❌ Пожалуйста, введи корректный вес (30-200 кг)');
      return;
    }
  }
  
  // Анкета - опыт
  if (user.state === 'questionnaire_experience') {
    if (text.includes('Новичок')) user.profile.experience = 'beginner';
    else if (text.includes('Средний')) user.profile.experience = 'intermediate';
    else if (text.includes('Продвинутый')) user.profile.experience = 'advanced';
    
    if (user.profile.experience) {
      user.state = 'menu';
      
      // Рассчитываем рекомендуемые веса для основных упражнений
      const recommendedWeights = {};
      Object.keys(exerciseWeights).forEach(exercise => {
        recommendedWeights[exercise] = recommendWeight(
          exercise, 
          user.profile.weight, 
          user.profile.experience
        );
      });
      user.profile.recommendedWeights = recommendedWeights;
      
      bot.sendMessage(chatId,
        `🎉 <b>Анкета завершена!</b>\n\n` +
        `📊 Твой профиль:\n` +
        `• Цель: ${user.profile.goal}\n` +
        `• Пол: ${user.profile.gender === 'male' ? 'Мужской' : 'Женский'}\n` +
        `• Возраст: ${user.profile.age}\n` +
        `• Вес: ${user.profile.weight} кг\n` +
        `• Опыт: ${text}\n\n` +
        `Теперь я могу давать персональные рекомендации по весам! 💪`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [
              ['🏋️ Начать тренировку'],
              ['➕ Создать тренировку'],
              ['📋 Мои тренировки'],
              ['👤 Мой профиль'],
              ['⏱ Таймер упражнений']
            ],
            resize_keyboard: true
          }
        }
      );
      return;
    }
  }

  // Таймер - ввод названия упражнения
  if (user.state === 'timer_set_name' && user.timerData) {
    user.timerData.name = text;
    user.state = 'timer_set_duration';
    
    bot.sendMessage(chatId,
      '⏰ <b>Введите длительность упражнения:</b>\n\n' +
      'Можно ввести в разных форматах:\n' +
      '• <code>30</code> - 30 секунд\n' +
      '• <code>2:30</code> - 2 минуты 30 секунд\n' +
      '• <code>1м 30с</code> - 1 минута 30 секунд\n\n' +
      'Пример: <code>1:30</code>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // Таймер - ввод длительности
  if (user.state === 'timer_set_duration' && user.timerData) {
    const duration = parseTime(text);
    if (!duration) {
      return bot.sendMessage(chatId, 
        '❌ Неверный формат времени!\n' +
        'Используйте: 30, 1:30, 2м 15с'
      );
    }
    
    user.timerData.duration = duration;
    user.state = 'timer_confirm';
    
    const timeStr = formatTime(duration);
    
    bot.sendMessage(chatId,
      `✅ <b>Таймер настроен:</b>\n\n` +
      `🏋️ Упражнение: ${user.timerData.name}\n` +
      `⏰ Время: ${timeStr}\n\n` +
      `Запустить таймер?`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            ['🚀 Запустить таймер'],
            ['❌ Отмена']
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // Запуск таймера
  if (user.state === 'timer_confirm' && user.timerData) {
    if (text === '🚀 Запустить таймер') {
      startSingleTimer(userId, chatId, user.timerData);
      delete user.timerData;
      user.state = 'menu';
      return;
    }
  }

  // Отмена в любом состоянии
  if (text === '❌ Отмена') {
    user.state = 'menu';
    delete user.timerData;
    
    bot.sendMessage(chatId, 'Действие отменено.', {
      reply_markup: {
        keyboard: [
          ['🏋️ Начать тренировку'],
          ['➕ Создать тренировку'],
          ['📋 Мои тренировки'],
          ['👤 Мой профиль'],
          ['⏱ Таймер упражнений']
        ],
        resize_keyboard: true
      }
    });
    return;
  }

  // Обработка создания тренировки
  if (user.state === 'creating_name' && user.newWorkout) {
    user.newWorkout.name = text;
    user.state = 'creating_exercises';
    user.newWorkout.currentExercise = { step: 'name' };
    
    bot.sendMessage(chatId,
      '💪 Введите название первого упражнения:\n\n' +
      'Пример: "Жим штанги лежа"',
      {
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // Обработка создания упражнений
  if (user.state === 'creating_exercises' && user.newWorkout && user.newWorkout.currentExercise) {
    const currentExercise = user.newWorkout.currentExercise;
    
    if (currentExercise.step === 'name') {
      currentExercise.name = text;
      currentExercise.step = 'weight';
      
      // Даем рекомендацию по весу
      let recommendation = '';
      if (user.profile && user.profile.recommendedWeights) {
        const recommendedWeight = user.profile.recommendedWeights[text];
        if (recommendedWeight && recommendedWeight > 0) {
          recommendation = `\n💡 Рекомендуемый вес: ${recommendedWeight.toFixed(1)} кг\n` +
                          `(это ориентир, используй комфортный для тебя вес)`;
        } else if (recommendedWeight === 0) {
          recommendation = `\n💡 Это упражнение с весом тела\n`;
        } else if (!recommendedWeight) {
          recommendation = `\n💡 Для этого упражнения нет рекомендаций в базе\n`;
        }
      }
      
      bot.sendMessage(chatId,
        `📊 Введите рабочий вес для "${text}":${recommendation}\n` +
        'Пример: "32.5" (можно использовать десятичные дроби)',
        {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        }
      );
    }
    else if (currentExercise.step === 'weight') {
      const weight = parseFloat(text.replace(',', '.')); // Поддержка и запятых и точек
      
      if (isNaN(weight) || weight < 0) {
        return bot.sendMessage(chatId, '❌ Введите корректное число для веса! Например: 25.5 или 30');
      }
      
      currentExercise.weight = weight;
      currentExercise.step = 'sets';
      
      bot.sendMessage(chatId,
        '🎯 Введите количество подходов для "' + currentExercise.name + '":\n\n' +
        'Пример: "4"',
        {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        }
      );
    }
    else if (currentExercise.step === 'sets') {
      const sets = parseInt(text);
      if (isNaN(sets) || sets < 1) {
        return bot.sendMessage(chatId, '❌ Введите число больше 0 для подходов!');
      }
      
      currentExercise.sets = sets;
      
      user.newWorkout.exercises.push({
        name: currentExercise.name,
        weight: currentExercise.weight,
        sets: currentExercise.sets
      });
      
      let message = '✅ Упражнение добавлено!\n\n';
      message += '💪 ' + currentExercise.name + '\n';
      message += '📊 Вес: ' + currentExercise.weight + 'kg\n';
      message += '🎯 Подходов: ' + currentExercise.sets + '\n\n';
      message += 'Всего упражнений: ' + user.newWorkout.exercises.length + '\n\n';
      message += 'Текущие упражнения:\n';
      user.newWorkout.exercises.forEach((ex, i) => {
        message += (i + 1) + '. ' + ex.name + ' - ' + ex.weight + 'kg (' + ex.sets + ' подходов)\n';
      });
      
      const keyboard = [['➕ Добавить еще упражнение']];
      if (user.newWorkout.exercises.length > 0) {
        keyboard.push(['🗑 Удалить последнее упражнение']);
      }
      keyboard.push(['✅ Завершить создание']);
      
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: keyboard,
          resize_keyboard: true
        }
      });
      
      user.newWorkout.currentExercise = { step: 'name' };
    }
    return;
  }

  bot.sendMessage(chatId, 'Используйте кнопки меню для управления тренировками.');
});

// Обработчик просмотра профиля
bot.onText(/👤 Мой профиль/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (!user.profile) {
    return bot.sendMessage(chatId, '❌ Сначала заполни анкету через /start');
  }
  
  let message = `👤 <b>Твой профиль</b>\n\n`;
  message += `🎯 Цель: ${user.profile.goal}\n`;
  message += `🚻 Пол: ${user.profile.gender === 'male' ? 'Мужской' : 'Женский'}\n`;
  message += `🎂 Возраст: ${user.profile.age}\n`;
  message += `⚖️ Вес: ${user.profile.weight} кг\n`;
  message += `🏆 Опыт: ${user.profile.experience === 'beginner' ? 'Новичок' : user.profile.experience === 'intermediate' ? 'Средний' : 'Продвинутый'}\n\n`;
  
  message += `💪 <b>Рекомендуемые веса (ориентир):</b>\n`;
  Object.keys(user.profile.recommendedWeights || {}).forEach(exercise => {
    const weight = user.profile.recommendedWeights[exercise];
    if (weight > 0) {
      message += `• ${exercise}: ${weight.toFixed(1)} кг\n`;
    }
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
});

// Создание тренировки
bot.onText(/➕ Создать тренировку/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userData.get(userId).state = 'creating_name';
  userData.get(userId).newWorkout = { exercises: [] };
  
  bot.sendMessage(chatId, 
    '📝 Введите название тренировки:\n\n' +
    'Пример: "Силовая программа" или "Тренировка груди"',
    {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    }
  );
});

// Мои тренировки
bot.onText(/📋 Мои тренировки/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (!user.workouts.length) {
    return bot.sendMessage(chatId, '❌ У вас пока нет тренировок. Создайте первую!');
  }
  
  let message = '📋 Ваши тренировки:\n\n';
  user.workouts.forEach((workout, index) => {
    message += `${index + 1}. ${workout.name}\n`;
    workout.exercises.forEach((ex, exIndex) => {
      message += `   ${exIndex + 1}. ${ex.name} - ${ex.weight}kg (${ex.sets} подходов)\n`;
    });
    message += '\n';
  });
  
  bot.sendMessage(chatId, message);
});

// Начать тренировку
bot.onText(/🏋️ Начать тренировку/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (!user.workouts.length) {
    return bot.sendMessage(chatId, '❌ У вас пока нет тренировок. Сначала создайте тренировку!');
  }
  
  const buttons = user.workouts.map((workout, index) => [
    { text: workout.name, callback_data: 'select_workout_' + index }
  ]);
  
  bot.sendMessage(chatId, '🏋️ Выберите тренировку:', {
    reply_markup: {
      inline_keyboard: buttons
    }
  );
});

// Обработка специальных кнопок создания тренировки
bot.onText(/➕ Добавить еще упражнение/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (user.state === 'creating_exercises') {
    user.newWorkout.currentExercise = { step: 'name' };
    
    bot.sendMessage(chatId,
      '💪 Введите название упражнения:\n\n' +
      'Пример: "Жим штанги лежа"',
      {
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
  }
});

bot.onText(/🗑 Удалить последнее упражнение/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (user.state === 'creating_exercises' && user.newWorkout.exercises.length > 0) {
    const removedExercise = user.newWorkout.exercises.pop();
    
    let message = `🗑 Упражнение "${removedExercise.name}" удалено!\n\n`;
    message += `Осталось упражнений: ${user.newWorkout.exercises.length}`;
    
    if (user.newWorkout.exercises.length > 0) {
      message += '\n\nТекущие упражнения:\n';
      user.newWorkout.exercises.forEach((ex, i) => {
        message += `${i + 1}. ${ex.name} - ${ex.weight}kg (${ex.sets} подходов)\n`;
      });
    }
    
    const keyboard = [['➕ Добавить еще упражнение']];
    if (user.newWorkout.exercises.length > 0) {
      keyboard.push(['🗑 Удалить последнее упражнение']);
    }
    keyboard.push(['✅ Завершить создание']);
    
    bot.sendMessage(chatId, message, {
      reply_markup: {
        keyboard: keyboard,
        resize_keyboard: true
      }
    });
  }
});

bot.onText(/✅ Завершить создание/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  if (user.state === 'creating_exercises') {
    if (user.newWorkout.exercises.length === 0) {
      return bot.sendMessage(chatId, '❌ Добавьте хотя бы одно упражнение!');
    }
    
    user.workouts.push(user.newWorkout);
    user.state = 'menu';
    delete user.newWorkout;
    
    bot.sendMessage(chatId,
      '🎉 Тренировка создана!\n\n' +
      'Теперь вы можете начать тренировку через меню.',
      {
        reply_markup: {
          keyboard: [
            ['🏋️ Начать тренировку'],
            ['➕ Создать тренировку'],
            ['📋 Мои тренировки'],
            ['👤 Мой профиль'],
            ['⏱ Таймер упражнений']
          ],
          resize_keyboard: true
        }
      }
    );
  }
});

console.log('🎉 Бот готов к работе!');
console.log('📱 Напишите /start в Telegram');
