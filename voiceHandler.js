const { downloadVoiceFile } = require('./api');
const { convertAudio } = require('./openai');
const {generatePlan} = require('./generatePlan')
const fs = require('fs');
const axios = require('axios');

const handleVoiceMessage = async (bot, msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.voice.file_id;
    const username = msg.from.username || msg.from.first_name || chatId.toString();

    try {
        // Отправляем сообщение "Загрузка..."
        const loadingMessage = await bot.sendMessage(chatId, 'Загрузка...');

        // Получение URL для скачивания файла
        const fileUrl = await downloadVoiceFile(bot, fileId);
        const fileName = `voicemessages/voice_${Date.now()}.mp3`;

        // Скачивание и сохранение файла
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream'
        });

        const writeStream = fs.createWriteStream(fileName);
        response.data.pipe(writeStream);

        writeStream.on('finish', async () => {
            try {
                // Файл сохранен, теперь можно вызывать convertAudio
                const audioText = await convertAudio(fileName);

                // Удаляем сообщение "Загрузка..."

                // Отправляем сообщение об успешной загрузке и тексте
                await bot.sendMessage(chatId, 'Ваше голосовое сообщение: ' + audioText);

                const plan = await generatePlan(audioText, username, bot, chatId);

                console.log("Всё отлично!");
                

                await bot.sendMessage(chatId, plan);

                fs.unlink(fileName, (err) => {
                    if (err) {
                        console.error('Ошибка при удалении файла:', err);
                    } else {
                        console.log('Файл успешно удален:', fileName);
                    }
                });
            } catch (err) {
                // Обработка ошибок конвертации
                await bot.sendMessage(chatId, 'Ошибка при обработке голосового сообщения.');
                console.error(err);
            }
        });
    } catch (error) {
        bot.sendMessage(chatId, 'Ошибка при обработке голосового сообщения.');
        console.error(error);
    }
};

module.exports = { handleVoiceMessage };
