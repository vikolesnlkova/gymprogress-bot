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

// Обработчик /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!userData.has(userId)) {
    userData.set(userId, {
      workouts: [],
      state: 'menu'
    });
  }
  
  userData.get(userId).state = 'menu';
  
  const options = {
    reply_markup: {
      keyboard: [
        ['🏋️ Начать тренировку'],
        ['➕ Создать тренировку'],
        ['📋 Мои тренировки']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, `💪 Привет, ${msg.from.first_name}! GymProgress готов к работе!`, options);
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
  });
});

// Обработка специальных кнопок
bot.onText(/❌ Отмена/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userData.get(userId).state = 'menu';
  delete userData.get(userId).newWorkout;
  
  bot.sendMessage(chatId, 'Действие отменено.', {
    reply_markup: {
      keyboard: [
        ['🏋️ Начать тренировку'],
        ['➕ Создать тренировку'],
        ['📋 Мои тренировки']
      ],
      resize_keyboard: true
    }
  });
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
            ['📋 Мои тренировки']
          ],
          resize_keyboard: true
        }
      }
    );
  }
});

// Обработка callback запросов
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
        ['📋 Мои тренировки']
      ],
      resize_keyboard: true
    }
  });
}

// Обработчик всех текстовых сообщений
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
    '✅ Завершить создание'
  ].includes(text)) return;
  
  const user = userData.get(userId);
  if (!user) return;
  
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

console.log('🎉 Бот готов к работе!');
console.log('📱 Напишите /start в Telegram');
