const TelegramBot = require('node-telegram-bot-api');
const voiceHandler = require('./voiceHandler');
const UserTG = require('./models/UserTG');
const generatePlan = require('./generatePlan');


const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

generatePlan.mongoConnect(bot)

const start = () => {
    // Обработка голосовых сообщений
    bot.on('voice', (msg) => {
        voiceHandler.handleVoiceMessage(bot, msg);
    });

    // Ответ на команду /start
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const username = msg.from.username;
        console.log(chatId);
        
    
        // Находим пользователя в базе данных
        let user = await UserTG.findOne({ username });
        
        if (!user) {
            // Если пользователя нет, создаем нового с chatId
            user = new UserTG({ username, chatId, plans: [] });
            await user.save();
            console.log(`Новый пользователь зарегистрирован: ${username}`);
        } else {
            // Обновляем chatId, если он не сохранен
            if (!user.chatId) {
                user.chatId = chatId;
                await user.save();
                console.log(`ChatId для пользователя ${username} обновлен`);
            }
        }
    
        bot.sendMessage(chatId, `👋 Привет! Я твой личный помощник по планированию дня. Просто отправь мне голосовое сообщение, где ты расскажешь о своих делах на сегодня, не беспокоясь о времени выполнения — я все сам распланирую! ⏰

✨ Мой искусственный интеллект соберет твои задачи в удобный распорядок и пришлет уведомления в нужное время. Будь готов к продуктивному дню — ты справишься на все 100%! 💪

📅 Отправляй голосовое сообщение, и начнем планировать твой идеальный день! 🎯`);
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const username = msg.from.username;
        const text = msg.text;

        // Игнорируем голосовые сообщения и команду /start
        if (msg.voice || text === '/start') {
            return;
        }

        bot.sendMessage(chatId, `Загрузка...`);

        const plan = await generatePlan.generatePlan(text, username, bot)

        bot.sendMessage(chatId, plan);
    });
};

const sendMessageToAllUsers = async (message) => {
    try {
        const users = await UserTG.find(); // Получаем всех пользователей из базы данных

        users.forEach(async (user) => {
            if (user.chatId) {
                try {
                    await bot.sendMessage(user.chatId, message); // Отправляем сообщение каждому пользователю
                    console.log(`Сообщение отправлено пользователю ${user.username}`);
                } catch (err) {
                    console.error(`Ошибка при отправке сообщения пользователю ${user.username}:`, err);
                }
            }
        });
    } catch (err) {
        console.error('Ошибка при получении пользователей:', err);
    }
};

module.exports = { start, sendMessageToAllUsers };