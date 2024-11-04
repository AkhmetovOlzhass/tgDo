const OpenAI = require('openai');
require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const UserTG = require('./models/UserTG');
const moment = require('moment-timezone');

const openai = new OpenAI({
    apiKey: process.env.OPENAI
});

const scheduledTasks = {};

function mongoConnect(bot) {
    mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(async () => {
            console.log('Connected to MongoDB');

            // Загружаем всех пользователей из базы данных и пересоздаем их задачи
            const users = await UserTG.find();

            users.forEach(user => {
                if (user.plans && user.plans.length > 0) {
                    console.log(`Пересоздаем задачи для пользователя ${user.username}`);
                    scheduledTasks[user.username] = user.plans.map(task => scheduleTask(task, user.username, bot));
                }
            });

        })
        .catch((err) => console.error('Error connecting to MongoDB:', err));
}



async function generatePlan(newTaskText, username, bot) {
    let user = await UserTG.findOne({ username });

    if (!user) {
        // Если пользователя нет, регистрируем его
        user = new UserTG({ username, plans: [] });
        await user.save();
        console.log(`Новый пользователь зарегистрирован: ${username}`);
    } else {
        console.log(`Пользователь ${username} уже существует в базе данных`);
    }

    // Формируем текст для OpenAI, комбинируя старые задачи с новыми
    const existingTasksText = user.plans.map(task => `${task.time}: ${task.task} \n ${task.description} `).join('\n');
    const combinedTasksText = `${existingTasksText}\n${newTaskText}`;
    
    // Генерируем новый план через OpenAI, передавая все задачи
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            "role": "system",
            "content": `
Ты — помощник, который помогает людям организовать их расписание. Твоя задача — принимать список дел и помогать пользователю составить полный план с указанием времени выполнения. Если пользователь указал конкретное время или дату для задачи, используй эти данные. Если время или дата не указаны, предложи логичный и удобный временной интервал для выполнения задачи, исходя из стандартного распорядка дня. Не используй символы форматирования, такие как ** или ##. Добавь мотивирующую фразу в начале и в конце расписания, чтобы подбодрить пользователя. Не придумывай от себя дополнительные занятия. НЕ ВЫДУМЫВАЙ НОВЫЕ ЗАДАНИЯ КОТОРЫЕ ПОЛЬЗОВАТЕЛЬ НЕ УПОМИНАЛ. Если задача была выполнена и пользователь это упомянул, замени крестик ❌ на галочку ✅ перед задачей. Если задача не была выполнена, оставь крестик ❌. Если начинается с одиночной цифры, записывай ее в формате не 7:00, а 07:00. Добавляй эмодзи чтобы выглядело приятнее. Не удаляй описание. Если пользователь просит удалить старое расписание ответь что расписание успешно удалено. Когда тебя просят показать расписание, не добавляй новых пунктов от себя.

Пример как должно выглядеть сообщение:

Начнем продуктивный день!

Вот как можно распланировать твое время для занятий уроками сегодня:

❌ 08:00 - 10:00: Проснуться

✅ 10:00 - 11:30: Первая сессия занятий
Начни с самых сложных или важных материалов, пока твоя концентрация на максимуме.

❌ 11:30 - 12:00: Перерыв
Используй это время, чтобы отдохнуть, размяться или перекусить.

❌ 12:00 - 13:30: Вторая сессия занятий
Продолжай работу, сосредоточившись на оставшихся темах или заданиях.

Ты отлично справишься, вперед к новым знаниям!
            `
          },
          {
            "role": "user",
            "content": combinedTasksText
          }
        ]
    });

    const planText = response.choices[0].message.content;

    // Извлекаем новые задачи из текста
    const tasks = extractTasksFromPlan(planText);
    
    try {

        console.log(tasks);
        
        // Заменяем старые задачи на новый план
        user.plans = tasks;

        // Сохраняем обновленного пользователя с новым планом
        await user.save();    
        console.log('Новый план успешно сохранен в базе данных');

        if (scheduledTasks[username]) {
            scheduledTasks[username].forEach(task => task.stop());
            console.log(`Удалены старые задачи для пользователя ${username}`);
        }

        scheduledTasks[username] = tasks.map(task => scheduleTask(task, username, bot));    

        // Возвращаем пользователю новый план
        return planText;

    } catch (error) {
        console.error('Ошибка при сохранении плана:', error);
        return 'Ошибка при сохранении плана.';
    }
}

function extractTasksFromPlan(planText) {
    console.log('Исходный текст плана:', planText);

    // Разбиваем текст на строки
    const lines = planText.split('\n').filter(line => line.trim() !== '');

    console.log('Найденные строки:', lines);

    const tasks = [];
    let currentTask = null;
    lines.forEach((line) => {
        // Регулярное выражение для поиска времени в формате 'HH:MM - HH:MM' или 'HH:MM - Задача'
        const emojiMatch = line.match(/^[^\w\s]/);
        const emoji = emojiMatch ? emojiMatch[0] : '';
        const timeMatch = line.match(/\d{2}:\d{2}\s*(-\s*\d{2}:\d{2})?/);

        if (timeMatch) {

            if (currentTask) {
                tasks.push(currentTask);
            }
            // Извлекаем временной диапазон и задачу
            const timeRange = timeMatch[0].trim();

            const timeWithEmoji = `${emoji} ${timeRange}`; 

            const task = line.replace(emoji, '').replace(timeRange, '').replace(':', '').trim();
            currentTask = { task, time: timeWithEmoji, description: '' };
        } else if (currentTask) {
            // Если это не задача, а дополнительный текст, добавляем его в описание текущей задачи
            currentTask.description += line.trim() + ' ';
        }
    });

    if (currentTask) {
        tasks.push(currentTask);
    }

    return tasks;
}

function scheduleTask(task, username, bot) {

    const cleanedTime = task.time.replace(/^[^\w\s]/, '').trim();
    const [startTime] = cleanedTime.split('-').map(t => t.trim());

    const [hours, minutes] = startTime.split(':');

    console.log(`Планируем задачу на ${hours}:${minutes} для пользователя ${username}`);

    if (!hours || !minutes || isNaN(hours) || isNaN(minutes)) {
        console.error(`Ошибка в формате времени: ${startTime}`);
        return;
    }

    const newCron = getCronTimeForAlmaty(startTime);

    const scheduledTask = cron.schedule(newCron, async () => {
        console.log(`Напоминание для пользователя ${username}: Пора выполнить задачу "${task.task}"`);

        const user = await UserTG.findOne({ username });
        if (user && user.chatId) {
            try {
                // Проверяем, есть ли крестик перед временем. Если нет, то уведомление не отправляется.
                if (task.time.startsWith('✅')) {
                    console.log(`Задача "${task.task}" уже выполнена. Уведомление не отправляется.`);
                    return;
                }

                const messageText = task.description 
                    ? `Напоминание: ${task.time}: ${task.task}\n${task.description}` 
                    : `Напоминание: ${task.time}: ${task.task}`;

                await bot.sendMessage(user.chatId, messageText);
                console.log(`Сообщение отправлено пользователю ${username}`);

                // Проверка, является ли это последнее уведомление
                const isLastTask = user.plans.every((plan) => plan.time.startsWith('✅'));
                if (isLastTask) {
                    // Формируем сообщение с полным списком выполненных задач
                    await bot.sendMessage(user.chatId, `Все задания на сегодня выполнены!`);

                    // Обновляем все задачи, возвращая крестики
                    user.plans = user.plans.map(plan => ({
                        ...plan,
                        time: plan.time.replace('✅', '❌')
                    }));
                    await user.save();
                    console.log(`Все задачи для пользователя ${username} сброшены на крестики.`);
                }
            } catch (err) {
                console.error(`Ошибка при отправке сообщения пользователю ${username}:`, err);
            }
        } else {
            console.log(`Не удалось найти chatId для пользователя ${username}`);
        }
    });

    console.log(`Задача "${task.task}" запланирована на ${startTime}`);

    return scheduledTask;
}



function getCronTimeForAlmaty(almatyTime) {

    const cleanedTime = almatyTime.replace(/^[^\w\s]/, '').trim();

    const [hours, minutes] = cleanedTime.split(':');
    const almatyDate = moment.tz({ hours: parseInt(hours), minutes: parseInt(minutes) }, 'Asia/Almaty');

    almatyDate.subtract(10, 'minutes');

    const serverDate = almatyDate.clone().tz('UTC');

    console.log(`Запуск задачи на ${serverDate.hours()}:${serverDate.minutes()} по UTC`);
    

    return `${serverDate.minutes()} ${serverDate.hours()} * * *`;
}

module.exports = { generatePlan, mongoConnect };
