// ================================================
// NIRA Earn - Backend Server (Clean Version)
// ================================================
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Telegraf } from 'telegraf';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
const APP_URL = process.env.APP_URL || 'https://nira-earn-bot.onrender.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const bot = new Telegraf(BOT_TOKEN);

// ================================================
// Verify Telegram initData
// ================================================
function verifyInitData(initData) {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;
        params.delete('hash');

        const dataCheckString = Array.from(params.entries())
            .map(([k, v]) => `${k}=${v}`)
            .sort()
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN).digest();

        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString).digest('hex');

        if (calculatedHash !== hash) return null;

        const userJson = params.get('user');
        return userJson ? JSON.parse(userJson) : null;
    } catch (e) {
        console.error('verifyInitData error:', e.message);
        return null;
    }
}

// ================================================
// Auth Middleware (with DEV fallback)
// ================================================
async function authMiddleware(req, res, next) {
    let initData = req.headers['x-init-data'] 
                || req.query.initData 
                || (req.body && req.body._initData);

    let tgUser = null;

    if (initData && initData.length > 10) {
        tgUser = verifyInitData(initData);
    }

    if (!tgUser && ADMIN_ID) {
        console.log('⚠️ DEV_MODE: using ADMIN_ID as fallback');
        tgUser = { id: ADMIN_ID, first_name: 'Admin', username: 'admin' };
    }

    if (!tgUser) {
        return res.status(401).json({ 
            error: 'Missing or invalid init data. Please open from Telegram.' 
        });
    }

    const { data: user, error } = await supabase
        .from('users').select('*')
        .eq('telegram_id', tgUser.id).maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    if (!user) {
        const { data: newUser, error: createError } = await supabase
            .from('users').insert({
                telegram_id: tgUser.id,
                username: tgUser.username || null,
                first_name: tgUser.first_name || 'User',
                balance: 0.07900000
            }).select().single();

        if (createError) return res.status(500).json({ error: createError.message });
        req.user = newUser;
    } else {
        if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
        req.user = user;
    }

    supabase.from('users')
        .update({ last_seen: new Date().toISOString() })
        .eq('telegram_id', req.user.telegram_id)
        .then(() => {}).catch(() => {});

    next();
          }
// ================================================
// Config
// ================================================
const AD_NETWORKS = {
    adsgram: { reward: 0.0005, daily_limit: 100 },
    gigapub: { reward: 0.0003, daily_limit: 150 },
    tads:    { reward: 0.0002, daily_limit: 60 },
    usl:     { reward: 0.0002, daily_limit: 80 },
    monetix: { reward: 0.0002, daily_limit: 80 },
    adexium: { reward: 0.0002, daily_limit: 80 },
    richads: { reward: 0.0002, daily_limit: 40 }
};

const TASK_REWARDS = {
    'b1': { reward: 0.0001, type: 'once' },
    'b2': { reward: 0.0001, type: 'once' },
    'b3': { reward: 0.0005, type: 'once', needReferrals: 3 },
    'd2': { reward: 0.0001, type: 'daily' }
};

// ================================================
// Referral Commission
// ================================================
async function distributeReferralCommission(buyerId, baseAmount) {
    try {
        const { data: buyer } = await supabase
            .from('users').select('referred_by')
            .eq('telegram_id', buyerId).single();

        if (!buyer?.referred_by) return;

        const l1Amount = baseAmount * 0.05;
        await supabase.rpc('increment_balance', {
            user_id: buyer.referred_by, amount: l1Amount
        });
        await supabase.from('transactions').insert({
            telegram_id: buyer.referred_by,
            type: 'referral', amount: l1Amount,
            description: 'عمولة إحالة المستوى 1'
        });

        const { data: l1 } = await supabase
            .from('users').select('referred_by')
            .eq('telegram_id', buyer.referred_by).single();

        if (l1?.referred_by) {
            const l2Amount = baseAmount * 0.03;
            await supabase.rpc('increment_balance', {
                user_id: l1.referred_by, amount: l2Amount
            });
            await supabase.from('transactions').insert({
                telegram_id: l1.referred_by,
                type: 'referral', amount: l2Amount,
                description: 'عمولة إحالة المستوى 2'
            });
        }
    } catch (e) {
        console.error('Referral error:', e.message);
    }
}

// ================================================
// API: /api/me
// ================================================
app.all('/api/me', authMiddleware, async (req, res) => {
    try {
        const { count: refCount } = await supabase
            .from('users').select('*', { count: 'exact', head: true })
            .eq('referred_by', req.user.telegram_id);

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { data: todayWatches } = await supabase
            .from('ad_watches').select('network')
            .eq('telegram_id', req.user.telegram_id)
            .gte('watched_at', todayStart.toISOString());

        const adProgress = {};
        (todayWatches || []).forEach(w => {
            adProgress[w.network] = (adProgress[w.network] || 0) + 1;
        });

        const { data: tasks } = await supabase
            .from('completed_tasks').select('task_id')
            .eq('telegram_id', req.user.telegram_id);

        res.json({
            telegram_id: req.user.telegram_id,
            username: req.user.username,
            first_name: req.user.first_name,
            balance: parseFloat(req.user.balance),
            wallet_connected: req.user.wallet_connected,
            wallet_address: req.user.wallet_address,
            referrals_count: refCount || 0,
            promos_used: req.user.promos_used,
            ad_progress: adProgress,
            completed_tasks: (tasks || []).map(t => t.task_id)
        });
    } catch (e) {
        console.error('/api/me error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Watch ad
// ================================================
app.all('/api/ads/watch', authMiddleware, async (req, res) => {
    try {
        const network = (req.body && req.body.network) || req.query.network;
        const config = AD_NETWORKS[network];
        if (!config) return res.status(400).json({ error: 'شبكة غير صحيحة' });

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { count } = await supabase
            .from('ad_watches').select('*', { count: 'exact', head: true })
            .eq('telegram_id', req.user.telegram_id)
            .eq('network', network)
            .gte('watched_at', todayStart.toISOString());

        if ((count || 0) >= config.daily_limit) {
            return res.status(400).json({ error: 'وصلت للحد اليومي' });
        }

        await supabase.from('ad_watches').insert({
            telegram_id: req.user.telegram_id,
            network, reward: config.reward
        });

        const newBalance = parseFloat(req.user.balance) + config.reward;
        await supabase.from('users')
            .update({ balance: newBalance })
            .eq('telegram_id', req.user.telegram_id);

        await supabase.from('transactions').insert({
            telegram_id: req.user.telegram_id,
            type: 'earning', amount: config.reward,
            description: `مشاهدة إعلان - ${network}`
        });

        await distributeReferralCommission(req.user.telegram_id, config.reward);

        res.json({ success: true, reward: config.reward, new_balance: newBalance });
    } catch (e) {
        console.error('/api/ads/watch error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Complete task
// ================================================
app.all('/api/tasks/complete', authMiddleware, async (req, res) => {
    try {
        const task_id = (req.body && req.body.task_id) || req.query.task_id;
        const config = TASK_REWARDS[task_id];
        if (!config) return res.status(400).json({ error: 'مهمة غير صحيحة' });

        if (config.type === 'once') {
            const { data: existing } = await supabase
                .from('completed_tasks').select('id')
                .eq('telegram_id', req.user.telegram_id)
                .eq('task_id', task_id).maybeSingle();
            if (existing) return res.status(400).json({ error: 'تم إنجاز المهمة مسبقاً' });
        }

        if (config.needReferrals) {
            const { count } = await supabase
                .from('users').select('*', { count: 'exact', head: true })
                .eq('referred_by', req.user.telegram_id);
            if ((count || 0) < config.needReferrals) {
                return res.status(400).json({ error: `تحتاج ${config.needReferrals} إحالات` });
            }
        }

        await supabase.from('completed_tasks').insert({
            telegram_id: req.user.telegram_id, task_id, reward: config.reward
        });

        const newBalance = parseFloat(req.user.balance) + config.reward;
        await supabase.from('users')
            .update({ balance: newBalance })
            .eq('telegram_id', req.user.telegram_id);

        await supabase.from('transactions').insert({
            telegram_id: req.user.telegram_id,
            type: 'task', amount: config.reward,
            description: `إتمام المهمة: ${task_id}`
        });

        res.json({ success: true, reward: config.reward, new_balance: newBalance });
    } catch (e) {
        console.error('/api/tasks/complete error:', e.message);
        res.status(500).json({ error: e.message });
    }
});
// ================================================
// API: Spin wheel
// ================================================
app.all('/api/tasks/spin', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const spinKey = `spin_${today}`;

        const { data: existing } = await supabase
            .from('completed_tasks').select('id')
            .eq('telegram_id', req.user.telegram_id)
            .eq('task_id', spinKey).maybeSingle();

        if (existing) return res.status(400).json({ error: 'جربت حظك اليوم بالفعل' });

        const rewards = [0.001, 0.005, 0.01, 0.05, 0.10, 0.20];
        const weights = [40, 25, 15, 10, 7, 3];
        let rand = Math.random() * 100;
        let acc = 0;
        let win = rewards[0];
        for (let i = 0; i < weights.length; i++) {
            acc += weights[i];
            if (rand <= acc) { win = rewards[i]; break; }
        }

        await supabase.from('completed_tasks').insert({
            telegram_id: req.user.telegram_id, task_id: spinKey, reward: win
        });

        const newBalance = parseFloat(req.user.balance) + win;
        await supabase.from('users')
            .update({ balance: newBalance })
            .eq('telegram_id', req.user.telegram_id);

        await supabase.from('transactions').insert({
            telegram_id: req.user.telegram_id,
            type: 'task', amount: win, description: 'عجلة الحظ اليومية'
        });

        res.json({ success: true, reward: win, new_balance: newBalance });
    } catch (e) {
        console.error('/api/tasks/spin error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Connect wallet
// ================================================
app.all('/api/wallet/connect', authMiddleware, async (req, res) => {
    try {
        const address = (req.body && req.body.address) || req.query.address;
        if (!address || address.length < 20) {
            return res.status(400).json({ error: 'عنوان غير صحيح' });
        }

        await supabase.from('users')
            .update({ wallet_connected: true, wallet_address: address })
            .eq('telegram_id', req.user.telegram_id);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Create campaign
// ================================================
app.all('/api/campaigns/create', authMiddleware, async (req, res) => {
    try {
        const b = req.body || {};
        const { link, target, clicks, cost, verification, banner } = b;

        if (!link || !clicks || !cost) {
            return res.status(400).json({ error: 'بيانات ناقصة' });
        }
        if (parseFloat(req.user.balance) < cost) {
            return res.status(400).json({ error: 'رصيد غير كافٍ' });
        }

        const newBalance = parseFloat(req.user.balance) - cost;
        await supabase.from('users')
            .update({ balance: newBalance })
            .eq('telegram_id', req.user.telegram_id);

        const { data: campaign } = await supabase.from('campaigns').insert({
            owner_id: req.user.telegram_id,
            link, target: target || 'channel',
            total_clicks: clicks, cost,
            verification: !!verification, banner: !!banner
        }).select().single();

        await supabase.from('transactions').insert({
            telegram_id: req.user.telegram_id,
            type: 'campaign', amount: -cost,
            description: `حملة إعلانية: ${link}`
        });

        res.json({ success: true, campaign, new_balance: newBalance });
    } catch (e) {
        console.error('/api/campaigns/create error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Get campaigns
// ================================================
app.all('/api/campaigns', authMiddleware, async (req, res) => {
    try {
        const { data } = await supabase
            .from('campaigns').select('*')
            .eq('owner_id', req.user.telegram_id)
            .order('created_at', { ascending: false });
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Leaderboard
// ================================================
app.all('/api/leaderboard/:type', async (req, res) => {
    try {
        const type = req.params.type;
        if (type === 'referrals') {
            const { data } = await supabase
                .from('users')
                .select('telegram_id, username, first_name, referrals_count')
                .order('referrals_count', { ascending: false })
                .limit(30);
            return res.json(data || []);
        }

        const { data } = await supabase
            .from('users')
            .select('telegram_id, username, first_name, balance')
            .order('balance', { ascending: false })
            .limit(30);
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Promo code
// ================================================
app.all('/api/promo/activate', authMiddleware, async (req, res) => {
    try {
        const code = (req.body && req.body.code) || req.query.code;
        if (!code || code.length < 4) {
            return res.status(400).json({ error: 'رمز غير صحيح' });
        }
        if (req.user.promos_used >= 10) {
            return res.status(400).json({ error: 'وصلت للحد الأقصى' });
        }

        const { data: promo } = await supabase
            .from('promo_codes').select('*')
            .eq('code', code.toUpperCase())
            .eq('is_active', true).maybeSingle();

        if (!promo) return res.status(400).json({ error: 'الرمز غير موجود' });
        if (promo.current_uses >= promo.max_uses) {
            return res.status(400).json({ error: 'الرمز منتهي' });
        }

        const newBalance = parseFloat(req.user.balance) + parseFloat(promo.reward);
        await supabase.from('users')
            .update({ balance: newBalance, promos_used: req.user.promos_used + 1 })
            .eq('telegram_id', req.user.telegram_id);

        await supabase.from('promo_codes')
            .update({ current_uses: promo.current_uses + 1 })
            .eq('id', promo.id);

        await supabase.from('transactions').insert({
            telegram_id: req.user.telegram_id,
            type: 'task', amount: promo.reward,
            description: `رمز ترويجي: ${code}`
        });

        res.json({ success: true, reward: promo.reward, new_balance: newBalance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// API: Withdraw
// ================================================
app.all('/api/withdraw', authMiddleware, async (req, res) => {
    try {
        if (!req.user.wallet_connected) {
            return res.status(400).json({ error: 'اربط المحفظة أولاً' });
        }
        if (parseFloat(req.user.balance) < 0.5) {
            return res.status(400).json({ error: 'الحد الأدنى للسحب 0.5 USDT' });
        }

        const amount = parseFloat(req.user.balance);
        await supabase.from('users')
            .update({ balance: 0 })
            .eq('telegram_id', req.user.telegram_id);

        await supabase.from('transactions').insert({
            telegram_id: req.user.telegram_id,
            type: 'withdraw', amount: -amount,
            description: `سحب إلى ${req.user.wallet_address}`
        });

        if (ADMIN_ID) {
            try {
                await bot.telegram.sendMessage(ADMIN_ID,
                    `💰 طلب سحب جديد\n` +
                    `👤 ${req.user.first_name} (@${req.user.username})\n` +
                    `🆔 ${req.user.telegram_id}\n` +
                    `💵 ${amount.toFixed(4)} USDT\n` +
                    `🏦 ${req.user.wallet_address}`
                );
            } catch (e) { console.error('Admin notify error:', e.message); }
        }

        res.json({ success: true, message: 'تم إرسال طلب السحب' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ================================================
// Bot: /start
// ================================================
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id;
        const firstName = ctx.from.first_name || 'User';
        const username = ctx.from.username || null;
        const startPayload = ctx.startPayload;

        const { data: existingUser } = await supabase
            .from('users').select('*')
            .eq('telegram_id', userId).maybeSingle();

        let isNewUser = false;

        if (!existingUser) {
            isNewUser = true;
            let referredBy = null;
            let referralLevel = 0;

            if (startPayload && startPayload.startsWith('ref_')) {
                const referrerId = parseInt(startPayload.replace('ref_', ''));
                if (referrerId && referrerId !== userId) {
                    const { data: referrer } = await supabase
                        .from('users')
                        .select('telegram_id, referral_level')
                        .eq('telegram_id', referrerId).maybeSingle();

                    if (referrer) {
                        referredBy = referrerId;
                        referralLevel = (referrer.referral_level || 0) + 1;
                        await supabase.rpc('increment_referrals', { user_id: referrerId });
                    }
                }
            }

            await supabase.from('users').insert({
                telegram_id: userId, username, first_name: firstName,
                balance: 0.07900000,
                referred_by: referredBy, referral_level: referralLevel
            });
        }

        const webAppUrl = `${APP_URL}/app.html`;

        const welcomeText = isNewUser
            ? `🎉 مرحباً بك في NIRA Earn يا ${firstName}!\n\n` +
              `💰 ابدأ بجمع USDT من خلال مشاهدة الإعلانات\n` +
              `👥 ادعُ أصدقاءك واكسب عمولات مدى الحياة\n` +
              `🏆 نافس في لوحة الصدارة\n\n` +
              `اضغط الزر أدناه للبدء 👇`
            : `👋 مرحباً بعودتك ${firstName}!\n\n` +
              `اضغط الزر أدناه للمتابعة 👇`;

        await ctx.reply(welcomeText, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🚀 فتح التطبيق', web_app: { url: webAppUrl } }
                ]]
            }
        });
    } catch (e) {
        console.error('Bot /start error:', e.message);
        ctx.reply('حدث خطأ، يرجى المحاولة لاحقاً.');
    }
});

bot.help((ctx) => {
    ctx.reply(
        '📖 *مساعدة NIRA Earn*\n\n' +
        '• اضغط على "فتح التطبيق" للبدء\n' +
        '• شاهد الإعلانات لكسب USDT\n' +
        '• ادعُ أصدقاءك للإحالة\n' +
        '• اسحب أرباحك عبر محفظة TON\n',
        { parse_mode: 'Markdown' }
    );
});

// ================================================
// Start
// ================================================
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
    bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/bot${BOT_TOKEN}`);
    app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
    console.log('✅ Bot using webhook');
} else {
    bot.launch();
    console.log('✅ Bot using polling');
}

app.get('/', (req, res) => {
    res.sendFile('app.html', { root: 'public' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 App URL: ${APP_URL}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
