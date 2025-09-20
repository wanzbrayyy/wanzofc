
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GroupSettings, UserWarnings } = require('./models.js');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatIdAdmin = process.env.ADMIN_CHAT_ID;
const FORWARD_USERNAME = process.env.TELEGRAM_USERNAME || 'wanzofc';
const bot = new TelegramBot(token, { polling: true });

const generateForwardHeader = () => `➡️dari *${FORWARD_USERNAME}*\n\n`;

const getOrCreateGroupSettings = async (chatId) => {
    let settings = await GroupSettings.findOne({ chatId });
    if (!settings) {
        settings = new GroupSettings({ chatId });
        await settings.save();
    }
    return settings;
};

const isUserAdmin = async (chatId, userId) => {
    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['creator', 'administrator'].includes(member.status);
    } catch (error) {
        return false;
    }
};

const initializeBot = () => {
    console.log('Bot Telegram telah diinisialisasi dan berjalan.');

    bot.onText(/\/start/, (msg) => {
        const header = generateForwardHeader();
        const responseText = `${header}Halo! Saya adalah bot manajemen grup dan notifikasi. Tambahkan saya ke grup Anda dan jadikan admin untuk memulai!`;
        bot.sendMessage(msg.chat.id, responseText, { parse_mode: 'Markdown' });
    });

    bot.on('new_chat_members', async (msg) => {
        const chatId = msg.chat.id;
        const newUser = msg.new_chat_member;
        const settings = await getOrCreateGroupSettings(chatId);

        if (settings.welcome.enabled && !newUser.is_bot) {
            await bot.restrictChatMember(chatId, newUser.id, {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            });

            let welcomeMsg = settings.welcome.message
                .replace('{fullname}', `${newUser.first_name} ${newUser.last_name || ''}`.trim())
                .replace('{groupname}', msg.chat.title);
            
            const header = generateForwardHeader();
            welcomeMsg = `${header}${welcomeMsg}`;

            const options = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Klik untuk Verifikasi Diri Anda', callback_data: `verify_${newUser.id}` }]
                    ]
                }
            };
            bot.sendMessage(chatId, welcomeMsg, options);
        }
    });

    bot.on('callback_query', async (callbackQuery) => {
        const data = callbackQuery.data;
        const msg = callbackQuery.message;
        const userIdClicking = callbackQuery.from.id;

        if (data.startsWith('verify_')) {
            const userIdToVerify = data.split('_')[1];

            if (userIdClicking.toString() !== userIdToVerify) {
                return bot.answerCallbackQuery(callbackQuery.id, { text: 'Ini bukan tombol verifikasi untuk Anda!', show_alert: true });
            }

            await bot.restrictChatMember(msg.chat.id, userIdToVerify, {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            });

            const header = generateForwardHeader();
            const successText = `${header}✅ *Verifikasi Berhasil!*\n\nSelamat datang, ${callbackQuery.from.first_name}! Anda sekarang dapat mengirim pesan di grup.`;
            
            await bot.editMessageText(successText, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });

            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Berhasil diverifikasi!' });
        }
    });

    bot.on('left_chat_member', async (msg) => {
        const chatId = msg.chat.id;
        const leftUser = msg.left_chat_member;
        const settings = await getOrCreateGroupSettings(chatId);

        if (settings.goodbye.enabled && !leftUser.is_bot) {
            let goodbyeMsg = settings.goodbye.message
                .replace('{fullname}', `${leftUser.first_name} ${leftUser.last_name || ''}`.trim())
                .replace('{groupname}', msg.chat.title);
            
            const header = generateForwardHeader();
            bot.sendMessage(chatId, `${header}${goodbyeMsg}`, { parse_mode: 'Markdown' });
        }
    });

    bot.on('message', async (msg) => {
        if (!msg.text || msg.chat.type === 'private') return;

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const messageText = msg.text;

        if (await isUserAdmin(chatId, userId)) return;

        const settings = await getOrCreateGroupSettings(chatId);

        if (settings.moderation.antiLink) {
            const linkRegex = /https?:\/\/[^\s]+|t\.me\/[^\s]+|www\.[^\s]+/g;
            if (linkRegex.test(messageText)) {
                await bot.deleteMessage(chatId, msg.message_id);
                const warningMsg = await bot.sendMessage(chatId, `⚠️ ${msg.from.first_name}, dilarang mengirim tautan di grup ini!`);
                setTimeout(() => bot.deleteMessage(chatId, warningMsg.message_id), 5000);
                return;
            }
        }
        
        const badWords = settings.moderation.badWords;
        if (badWords && badWords.length > 0) {
            const isToxic = badWords.some(word => messageText.toLowerCase().includes(word.toLowerCase()));
            if (isToxic) {
                await bot.deleteMessage(chatId, msg.message_id);

                let userWarn = await UserWarnings.findOneAndUpdate(
                    { userId, chatId },
                    { $inc: { warns: 1 } },
                    { new: true, upsert: true }
                );

                const warnLimit = settings.moderation.warnLimit;
                if (userWarn.warns >= warnLimit) {
                    await bot.banChatMember(chatId, userId);
                    await UserWarnings.deleteOne({ userId, chatId });
                    const banMsg = `🚫 ${msg.from.first_name} telah diban karena mencapai batas ${warnLimit} peringatan.`;
                    bot.sendMessage(chatId, banMsg);
                } else {
                    const warnMsg = `⚠️ ${msg.from.first_name}, harap jaga ucapan Anda! (Peringatan ${userWarn.warns}/${warnLimit})`;
                    bot.sendMessage(chatId, warnMsg);
                }
            }
        }
    });

    bot.onText(/\/setwelcome (.+)/, async (msg, match) => {
        if (!await isUserAdmin(msg.chat.id, msg.from.id)) return;
        const chatId = msg.chat.id;
        const message = match[1];
        await GroupSettings.updateOne({ chatId }, { 'welcome.enabled': true, 'welcome.message': message }, { upsert: true });
        const header = generateForwardHeader();
        bot.sendMessage(chatId, `${header}✅ Pesan selamat datang telah diatur.`, { parse_mode: 'Markdown' });
    });
    
    bot.onText(/\/antilink (on|off)/, async (msg, match) => {
        if (!await isUserAdmin(msg.chat.id, msg.from.id)) return;
        const status = match[1] === 'on';
        await GroupSettings.updateOne({ chatId: msg.chat.id }, { 'moderation.antiLink': status }, { upsert: true });
        const header = generateForwardHeader();
        bot.sendMessage(chatId, `${header}✅ Mode anti-link sekarang \`${status ? 'AKTIF' : 'NONAKTIF'}\`.`, { parse_mode: 'Markdown' });
    });
};

const sendNotification = async (requestData) => {
    if (!token || !chatIdAdmin) {
        console.error('Telegram Token atau Chat ID Admin tidak ditemukan di .env');
        return;
    }

    const header = generateForwardHeader();
    let message = `${header}🔔 *Permintaan Baru Masuk*\n\n`;
    message += `*Judul:*\n${requestData.title}\n\n`;
    message += `*Deskripsi:*\n${requestData.description}`;

    const options = { parse_mode: 'Markdown' };

    if (requestData.url) {
        options.reply_markup = {
            inline_keyboard: [[{ text: '🔗 Lihat Tautan Referensi', url: requestData.url }]]
        };
    }

    await bot.sendMessage(chatIdAdmin, message, options);

    if (requestData.imageUrl) {
        try {
            const imageUrl = `${process.env.BASE_URL}${requestData.imageUrl}`;
            const response = await axios({ url: imageUrl, method: 'GET', responseType: 'stream' });
            const tempImagePath = path.join(__dirname, 'public', 'uploads', `temp_${path.basename(requestData.imageUrl)}`);
            const writer = fs.createWriteStream(tempImagePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const captionText = `${header}*Gambar untuk:* ${requestData.title}`;
            await bot.sendPhoto(chatIdAdmin, tempImagePath, { caption: captionText, parse_mode: 'Markdown' });
            fs.unlinkSync(tempImagePath);

        } catch (error) {
            bot.sendMessage(chatIdAdmin, `${header}⚠️ Gagal memproses gambar untuk permintaan: "${requestData.title}"`, { parse_mode: 'Markdown' });
        }
    }
};

module.exports = { initializeBot, sendNotification };