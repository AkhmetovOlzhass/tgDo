const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    task: String,
    time: String,
    description: String
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    chatId: {type: Number, required: true},
    plans: {        monday: [planSchema],
        tuesday: [planSchema],
        wednesday: [planSchema],
        thursday: [planSchema],
        friday: [planSchema],
        saturday: [planSchema],
        sunday: [planSchema]},
    createdAt: { type: Date, default: Date.now }
});

const UserTG = mongoose.model('UserTG', userSchema);

module.exports = UserTG;