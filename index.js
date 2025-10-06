require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

console.log('🚀 Запускаем GymProgress...');

const bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});
console.log('✅ Бот запущен');

// Хранилище данных
const userData = new Map();
// Хранилище активных таймеров
const activeTimers = new Map();

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
    
    // Начинаем анкету
    startQuestionnaire(chatId, userId);
    return;
  }
  
  userData.get(userId).state = 'menu';
  showMainMenu(chatId, msg.from.first_name);
});

// Функция анкетирования
function startQuestionnaire(chatId, userId) {
  const user = userData.get(userId);
  user.state = 'questionnaire_weight';
  
  bot.sendMessage(chatId,
    '📝 Давайте создадим ваш профиль!\n\n' +
    'Сначала укажите ваш текущий вес (в кг):\n' +
    'Пример: 75.5',
    {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    }
  );
}

// Функция расчета рекомендуемых весов
function calculateRecommendedWeights(user) {
  const weight = user.profile.weight;
  const experience = user.profile.experience;
  const goal = user.profile.goal;
  
  let baseMultiplier, assistanceMultiplier;
  
  // Множители по опыту
  switch(experience) {
    case 'beginner':
      baseMultiplier = 0.4;
      assistanceMultiplier = 0.3;
      break;
    case 'intermediate':
      baseMultiplier = 0.6;
      assistanceMultiplier = 0.45;
      break;
    case 'advanced':
      baseMultiplier = 0.8;
      assistanceMultiplier = 0.6;
      break;
    default:
      baseMultiplier = 0.5;
      assistanceMultiplier = 0.35;
  }
  
  // Корректировка по цели
  switch(goal) {
    case 'weight_loss':
      baseMultiplier *= 0.9;
      assistanceMultiplier *= 0.85;
      break;
    case 'strength':
      baseMultiplier *= 1.1;
      assistanceMultiplier *= 1.0;
      break;
    case 'muscle_gain':
      baseMultiplier *= 1.0;
      assistanceMultiplier *= 0.95;
      break;
    case 'endurance':
      baseMultiplier *= 0.8;
      assistanceMultiplier *= 0.7;
      break;
  }
  
  user.profile.recommendedWeights = {
    base: Math.round(weight * baseMultiplier * 10) / 10,
    assistance: Math.round(weight * assistanceMultiplier * 10) / 10
  };
}

// Функция рекомендации веса для упражнения
function recommendWeightForExercise(user, exerciseName) {
  const recommended = user.profile.recommendedWeights;
  if (!recommended) return null;
  
  const exercise = exerciseName.toLowerCase();
  
  // Базовые упражнения
  if (exercise.includes('жим') || exercise.includes('присед') || 
      exercise.includes('тяга') || exercise.includes('становая')) {
    return recommended.base;
  }
  
  // Вспомогательные упражнения
  return recommended.assistance;
}

// Вспомогательные функции
function getGoalText(goal) {
  const goals = {
    'muscle_gain': '💪 Набор мышечной массы',
    'weight_loss': '🏃 Похудение',
    'strength': '🏋️ Увеличение силы', 
    'endurance': '🏃‍♂️ Выносливость',
    'maintenance': '🧘 Поддержание формы'
  };
  return goals[goal] || 'Не указана';
}

function getExperienceText(experience) {
  const experiences = {
    'beginner': '🚀 Начинающий',
    'intermediate': '📈 Средний',
    'advanced': '💎 Продвинутый'
  };
  return experiences[experience] || 'Не указан';
}

// Функция парсинга времени
function parseTimeInput(input) {
  if (!input) return null;
  
  // Если просто число - считаем секундами
  if (/^\d+$/.test(input)) {
    return parseInt(input);
  }
  
  // Формат: 30s, 2m, 1m30s
  let totalSeconds = 0;
  const minutesMatch = input.match(/(\d+)m/);
  const secondsMatch = input.match(/(\d+)s/);
  
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1]) * 60;
  }
  
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1]);
  }
  
  // Если нет ни минут ни секунд, но есть буквы - ошибка
  if (!minutesMatch && !secondsMatch && /[a-zA-Z]/.test(input)) {
    return null;
  }
  
  return totalSeconds || null;
}

// Функция форматирования времени
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}м ${secs}с`;
  }
  return `${secs} секунд`;
}

// Функция запуска таймера
function startTimer(chatId, userId, exerciseName, duration) {
  const timerId = `${userId}_${Date.now()}`;
  
  bot.sendMessage(chatId,
    `⏱️ Таймер запущен!\n\n` +
    `💪 Упражнение: ${exerciseName}\n` +
    `⏰ Время: ${formatTime(duration)}\n\n` +
    `Таймер сработает через ${formatTime(duration)}`
  );
  
  // Устанавливаем таймер
  const timeoutId = setTimeout(() => {
    bot.sendMessage(chatId,
      `🔔 Таймер!\n\n` +
      `💪 Упражнение: ${exerciseName}\n` +
      `⏰ Время вышло! ${formatTime(duration)} завершено!\n\n` +
      `🎉 Отличная работа!`
    );
    
    // Удаляем из активных таймеров
    activeTimers.delete(timerId);
  }, duration * 1000);
  
  // Сохраняем информацию о таймере
  activeTimers.set(timerId, {
    userId: userId,
    chatId: chatId,
    exerciseName: exerciseName,
    duration: duration,
    startTime: Date.now(),
    timeoutId: timeoutId
  });
  
  // Отправляем сообщение о прогрессе через половину времени
  if (duration > 30) {
    setTimeout(() => {
      const remaining = Math.ceil(duration / 2);
      bot.sendMessage(chatId,
        `⏰ Половина времени прошла!\n` +
        `Осталось: ${formatTime(remaining)}\n` +
        `💪 ${exerciseName} - продолжайте в том же духе!`
      );
    }, (duration / 2) * 1000);
  }
}

// Главное меню
function showMainMenu(chatId, firstName, customMessage = null) {
  const message = customMessage || `💪 Привет, ${firstName}! GymProgress готов к работе!`;
  
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

// Обработка всех сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  
  if (text.startsWith('/')) return;
  if ([
    '🏋️ Начать тренировку', 
    '➕ Создать тренировку', 
    '📋 Мои тренировки',
    '❌ Отмена',
    '➕ Добавить еще упражнение',
    '🗑 Удалить последнее упражнение',
    '✅ Завершить создание',
    '⏱️ Таймер упражнений'
  ].includes(text)) return;
  
  const user = userData.get(userId);
  if (!user) return;

  // Обработка анкеты
  if (user.state === 'questionnaire_weight') {
    const weight = parseFloat(text);
    if (isNaN(weight) || weight < 30 || weight > 300) {
      return bot.sendMessage(chatId, '❌ Пожалуйста, введите корректный вес (30-300 кг):');
    }
    
    user.profile.weight = weight;
    user.state = 'questionnaire_goal';
    
    bot.sendMessage(chatId,
      '🎯 Какова ваша основная цель?\n\n' +
      '1. 💪 Набор мышечной массы\n' +
      '2. 🏃 Похудение\n' +
      '3. 🏋️ Увеличение силы\n' +
      '4. 🏃‍♂️ Выносливость\n' +
      '5. 🧘 Поддержание формы',
      {
        reply_markup: {
          keyboard: [
            ['💪 Набор массы'],
            ['🏃 Похудение'],
            ['🏋️ Увеличение силы'],
            ['🏃‍♂️ Выносливость'],
            ['🧘 Поддержание формы'],
            ['❌ Отмена']
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }
  
  if (user.state === 'questionnaire_goal') {
    const goals = {
      '💪 набор массы': 'muscle_gain',
      '🏃 похудение': 'weight_loss', 
      '🏋️ увеличение силы': 'strength',
      '🏃‍♂️ выносливость': 'endurance',
      '🧘 поддержание формы': 'maintenance'
    };
    
    const goalKey = text.toLowerCase();
    const goal = Object.keys(goals).find(g => goalKey.includes(g.split(' ')[1]));
    
    if (goal) {
      user.profile.goal = goals[goal];
      user.state = 'questionnaire_experience';
      
      bot.sendMessage(chatId,
        '📊 Какой у вас опыт тренировок?\n\n' +
        '1. 🚀 Начинающий (до 6 месяцев)\n' +
        '2. 📈 Средний (6 месяцев - 2 года)\n' +
        '3. 💎 Продвинутый (более 2 лет)',
        {
          reply_markup: {
            keyboard: [
              ['🚀 Начинающий'],
              ['📈 Средний'],
              ['💎 Продвинутый'],
              ['❌ Отмена']
            ],
            resize_keyboard: true
          }
        }
      );
    }
    return;
  }
  
  if (user.state === 'questionnaire_experience') {
    const experiences = {
      '🚀 начинающий': 'beginner',
      '📈 средний': 'intermediate',
      '💎 продвинутый': 'advanced'
    };
    
    const expKey = text.toLowerCase();
    const experience = Object.keys(experiences).find(exp => expKey.includes(exp.split(' ')[1]));
    
    if (experience) {
      user.profile.experience = experiences[experience];
      user.state = 'menu';
      
      // Рассчитываем рекомендуемые веса
      calculateRecommendedWeights(user);
      
      let message = '🎉 Профиль создан!\n\n';
      message += `📊 Ваш профиль:\n`;
      message += `• Вес: ${user.profile.weight} кг\n`;
      message += `• Цель: ${getGoalText(user.profile.goal)}\n`;
      message += `• Опыт: ${getExperienceText(user.profile.experience)}\n\n`;
      message += `💡 Рекомендуемые веса:\n`;
      message += `• Базовые упражнения: ${user.profile.recommendedWeights?.base || 'N/A'} кг\n`;
      message += `• Вспомогательные: ${user.profile.recommendedWeights?.assistance || 'N/A'} кг\n`;
      
      showMainMenu(chatId, msg.from.first_name, message);
    }
    return;
  }

  // Обработка таймера
  if (user.state === 'setting_timer') {
    const timeInSeconds = parseTimeInput(text);
    
    if (timeInSeconds === null || timeInSeconds < 5 || timeInSeconds > 3600) {
      return bot.sendMessage(chatId, '❌ Введите корректное время (от 5 секунд до 1 часа):');
    }
    
    user.state = 'timer_naming';
    user.timerData = { duration: timeInSeconds };
    
    bot.sendMessage(chatId,
      `⏱️ Время установлено: ${formatTime(timeInSeconds)}\n\n` +
      'Введите название упражнения для таймера:\n' +
      'Пример: "Планка" или "Удержание позы"',
      {
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
    return;
  }
  
  if (user.state === 'timer_naming') {
    const exerciseName = text;
    const timerData = user.timerData;
    
    // Запускаем таймер
    startTimer(chatId, userId, exerciseName, timerData.duration);
    
    user.state = 'menu';
    delete user.timerData;
    
    return;
  }
  
  // Обработка создания тренировки (существующий код)
  if (user.state === 'creating_name') {
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
  
  if (user.state === 'creating_exercises') {
    const currentExercise = user.newWorkout.currentExercise;
    
    if (currentExercise.step === 'name') {
      currentExercise.name = text;
      currentExercise.step = 'weight';
      
      bot.sendMessage(chatId,
        '📊 Введите рабочий вес для "' + text + '":\n\n' +
        'Пример: "60" (в кг)',
        {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        }
      );
    }
    else if (currentExercise.step === 'weight') {
      const weight = parseFloat(text);
      if (isNaN(weight)) {
        return bot.sendMessage(chatId, '❌ Введите число для веса!');
      }
      
      // Рекомендация веса
      const recommendedWeight = recommendWeightForExercise(user, currentExercise.name);
      let message = `📊 Вес "${weight}kg" сохранен для "${currentExercise.name}"`;
      
      if (recommendedWeight && Math.abs(weight - recommendedWeight) > 10) {
        const diff = weight - recommendedWeight;
        if (diff > 0) {
          message += `\n\n💡 Совет: Рекомендуемый вес для вас: ${recommendedWeight}kg\n`;
          message += `Сейчас вы используете вес на ${diff.toFixed(1)}kg больше рекомендуемого.`;
        } else {
          message += `\n\n💡 Совет: Рекомендуемый вес для вас: ${recommendedWeight}kg\n`;
          message += `Вы можете увеличить вес на ${Math.abs(diff).toFixed(1)}kg для лучшего прогресса.`;
        }
      }
      
      currentExercise.weight = weight;
      currentExercise.step = 'sets';
      
      bot.sendMessage(chatId, message + 
        '\n\n🎯 Теперь введите количество подходов:',
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

// Обработчики кнопок (существующий код)
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
  });
});

bot.onText(/⏱️ Таймер упражнений/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userData.get(userId).state = 'setting_timer';
  
  bot.sendMessage(chatId,
    '⏱️ Установите таймер для упражнения\n\n' +
    'Введите время в одном из форматов:\n' +
    '• 30s - 30 секунд\n' +
    '• 2m - 2 минуты\n' +
    '• 1m30s - 1 минута 30 секунд\n' +
    '• 90 - 90 секунд (по умолчанию)\n\n' +
    'Пример: 45s или 2m15s',
    {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    }
  );
});

bot.onText(/❌ Отмена/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = userData.get(userId);
  
  // Отмена активных таймеров пользователя
  let cancelledTimers = 0;
  for (const [timerId, timer] of activeTimers) {
    if (timer.userId === userId) {
      clearTimeout(timer.timeoutId);
      activeTimers.delete(timerId);
      cancelledTimers++;
    }
  }
  
  if (cancelledTimers > 0) {
    bot.sendMessage(chatId, `⏹️ Отменено активных таймеров: ${cancelledTimers}`);
  }
  
  user.state = 'menu';
  delete user.timerData;
  delete user.newWorkout;
  
  showMainMenu(chatId, msg.from.first_name, 'Действие отменено.');
});

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
            ['⏱️ Таймер упражнений']
          ],
          resize_keyboard: true
        }
      }
    );
  }
});

// Обработка callback запросов (существующий код)
bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  const user = userData.get(userId);
  
  if (data.startsWith('select_workout_')) {
    const workoutIndex = parseInt(data.split('_')[2]);
    const workout = user.workouts[workoutIndex];
    
    user.state = 'workout_selected';
    user.currentWorkout = {
      workoutIndex: workoutIndex,
      currentExerciseIndex: 0,
      exercises: workout.exercises.map(ex => ({
        name: ex.name,
        weight: ex.weight,
        targetSets: ex.sets,
        completedSets: []
      }))
    };
    
    showExercise(chatId, userId);
  }
  else if (data.startsWith('set_done_')) {
    const exerciseIndex = user.currentWorkout.currentExerciseIndex;
    const currentExercise = user.currentWorkout.exercises[exerciseIndex];
    
    currentExercise.completedSets.push({
      number: currentExercise.completedSets.length + 1,
      weight: currentExercise.weight,
      reps: 8
    });
    
    showExercise(chatId, userId);
  }
  else if (data === 'next_exercise') {
    user.currentWorkout.currentExerciseIndex++;
    showExercise(chatId, userId);
  }
  else if (data === 'finish_workout') {
    finishWorkout(chatId, userId);
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// Показать текущее упражнение
function showExercise(chatId, userId) {
  const user = userData.get(userId);
  const workout = user.currentWorkout;
  const exerciseIndex = workout.currentExerciseIndex;
  const exercise = workout.exercises[exerciseIndex];
  
  let message = `🏋️ Упражнение ${exerciseIndex + 1}/${workout.exercises.length}\n\n`;
  message += `💪 ${exercise.name}\n`;
  message += `📊 Рабочий вес: ${exercise.weight}kg\n`;
  message += `🎯 Целевое количество подходов: ${exercise.targetSets}\n\n`;
  message += `✅ Выполнено подходов: ${exercise.completedSets.length}/${exercise.targetSets}\n\n`;
  
  if (exercise.completedSets.length > 0) {
    message += '📈 Выполненные подходы:\n';
    exercise.completedSets.forEach(set => {
      message += `   ${set.number}. ${set.weight}kg × ${set.reps} раз\n`;
    });
  }
  
  const isLastExercise = exerciseIndex === workout.exercises.length - 1;
  const allSetsCompleted = exercise.completedSets.length >= exercise.targetSets;
  
  const buttons = [];
  
  if (!allSetsCompleted) {
    buttons.push([{ text: '✅ Подход выполнен', callback_data: 'set_done_' + exerciseIndex }]);
  }
  
  if (allSetsCompleted && !isLastExercise) {
    buttons.push([{ text: '➡️ Следующее упражнение', callback_data: 'next_exercise' }]);
  }
  
  buttons.push([{ text: '🏁 Завершить тренировку', callback_data: 'finish_workout' }]);
  
  if (!workout.currentMessageId) {
    bot.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: buttons }
    }).then(sentMsg => {
      workout.currentMessageId = sentMsg.message_id;
    });
  } else {
    bot.editMessageText(message, {
      chat_id: chatId,
      message_id: workout.currentMessageId,
      reply_markup: { inline_keyboard: buttons }
    });
  }
}

// Завершить тренировку
function finishWorkout(chatId, userId) {
  const user = userData.get(userId);
  const workout = user.currentWorkout;
  
  let totalSets = 0;
  let completedSets = 0;
  
  workout.exercises.forEach(ex => {
    totalSets += ex.targetSets;
    completedSets += ex.completedSets.length;
  });
  
  let message = '🎉 Тренировка завершена!\n\n';
  message += '📊 Итоги:\n';
  message += `• Упражнений: ${workout.exercises.length}\n`;
  message += `• Запланировано подходов: ${totalSets}\n`;
  message += `• Выполнено подходов: ${completedSets}\n\n`;
  
  if (completedSets >= totalSets) {
    message += '💪 Отличная работа!';
  } else {
    message += '💪 Хорошая работа, в следующий раз сделаете больше!';
  }
  
  user.state = 'menu';
  delete user.currentWorkout;
  
  bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: [
        ['🏋️ Начать тренировку'],
        ['➕ Создать тренировку'],
        ['📋 Мои тренировки'],
        ['⏱️ Таймер упражнений']
      ],
      resize_keyboard: true
    }
  });
}

console.log('🎉 Бот готов к работе!');
console.log('📱 Напишите /start в Telegram');
