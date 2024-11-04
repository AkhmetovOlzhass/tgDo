const express = require('express');
require('dotenv').config();
const bot = require('./bot');

const app = express();

const port = process.env.PORT || 3000;
app.listen(port, () => {
    bot.start();

    // bot.sendMessageToAllUsers('Кто заблокирует бота, тот гей')
    
    console.log(`App is running on port ${port}`);
});

// Запуск бота
    