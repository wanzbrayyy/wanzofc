const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  title: String,
  description: String,
  url: String,
  imageUrl: String,
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const groupSettingsSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    welcome: {
        enabled: { type: Boolean, default: false },
        message: { type: String, default: 'Selamat datang {fullname} di grup {groupname}!' },
        useVerification: { type: Boolean, default: true }
    },
    goodbye: {
        enabled: { type: Boolean, default: false },
        message: { type: String, default: 'Selamat tinggal {fullname}!' }
    },
    moderation: {
        antiLink: { type: Boolean, default: false },
        warnLimit: { type: Number, default: 3 },
        badWords: { type: [String], default: [] }
    }
});

const userWarningsSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    chatId: { type: String, required: true },
    warns: { type: Number, default: 0 }
});
userWarningsSchema.index({ userId: 1, chatId: 1 }, { unique: true });

const Request = mongoose.model('Request', requestSchema);
const GroupSettings = mongoose.model('GroupSettings', groupSettingsSchema);
const UserWarnings = mongoose.model('UserWarnings', userWarningsSchema);

module.exports = { Request, GroupSettings, UserWarnings };