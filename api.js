const downloadVoiceFile = async (bot, fileId) => {
    const fileInfo = await bot.getFile(fileId);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
    return fileUrl;
};

module.exports = { downloadVoiceFile };
