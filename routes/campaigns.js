const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RATES = {
  direct: 0.0025,
  with_verification: 0.0030,
  banner: 0.0050
};

// 1. إنشاء حملة جديدة وخصم الرصيد
router.post('/create', async (req, res) => {
  const { telegramId, title, targetUrl, description, campaignType, currency, clicks } = req.body;

  const rate = RATES[campaignType];
  if (!rate) return res.status(400).json({ error: 'نوع الحملة غير صالح' });

  const totalCost = clicks * rate;
  const balanceField = currency === 'GRAM' ? 'balance_gram' : 'balance_usdt';

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (userErr || !user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (user[balanceField] < totalCost) {
    return res.status(400).json({ error: `رصيد ${currency} غير كافٍ. التكلفة: ${totalCost}` });
  }

  const { error: deductErr } = await supabase
    .from('users')
    .update({ [balanceField]: Number(user[balanceField]) - totalCost })
    .eq('telegram_id', telegramId);

  if (deductErr) return res.status(500).json({ error: 'فشل خصم الرصيد' });

  const { data: campaign, error: campErr } = await supabase
    .from('nera_campaigns')
    .insert([{
      advertiser_id: telegramId,
      title,
      target_url: targetUrl,
      description,
      c_type: campaignType,
      currency,
      cost_per_click: rate,
      total_clicks: clicks
    }])
    .select()
    .single();

  if (campErr) return res.status(500).json({ error: 'فشل إنشاء الحملة' });

  res.json({ success: true, campaign });
});

// 2. جلب الحملات المتاحة للمستخدم
router.get('/available/:telegramId', async (req, res) => {
  const { telegramId } = req.params;

  const { data: completed } = await supabase
    .from('nera_completed_tasks')
    .select('campaign_id')
    .eq('user_id', telegramId);

  const completedIds = completed ? completed.map(c => c.campaign_id) : [];

  let query = supabase
    .from('nera_campaigns')
    .select('*')
    .eq('status', 'active');

  if (completedIds.length > 0) {
    query = query.not('id', 'in', `(${completedIds.join(',')})`);
  }

  const { data: campaigns, error } = await query;
  if (error) return res.status(500).json({ error: 'خطأ في جلب الحملات' });

  res.json({ campaigns });
});

// 3. التحقق من تنفيذ المهمة وإيداع المكافأة للمستخدم
router.post('/verify', async (req, res) => {
  const { telegramId, campaignId } = req.body;

  // أ) التأكد من عدم تكرار المهمة
  const { data: existing } = await supabase
    .from('nera_completed_tasks')
    .select('*')
    .eq('user_id', telegramId)
    .eq('campaign_id', campaignId)
    .single();

  if (existing) return res.status(400).json({ error: 'لقد أكملت هذه المهمة بالفعل' });

  // ب) جلب بيانات الحملة
  const { data: campaign, error: campErr } = await supabase
    .from('nera_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('status', 'active')
    .single();

  if (campErr || !campaign) return res.status(404).json({ error: 'الحملة غير متاحة' });

  // ج) التحقق الآلي عبر Telegram Bot API في حال كانت القناة تتطلب اشتراكاً
  if (campaign.c_type === 'with_verification') {
    const channelUsername = campaign.target_url.split('/').pop().replace('@', '');
    try {
      const tgRes = await axios.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`, {
        params: { chat_id: `@${channelUsername}`, user_id: telegramId }
      });

      const status = tgRes.data?.result?.status;
      const isMember = ['member', 'administrator', 'creator'].includes(status);

      if (!isMember) return res.status(400).json({ error: 'لم يتم التحقق من انضمامك للقناة' });
    } catch (e) {
      return res.status(500).json({ error: 'تعذر التحقق، تأكد من إضافة البوت كمشرف في القناة المروجة' });
    }
  }

  // د) تخصيص صافي مكافأة المنفذ (60% من قيمة التكلفة)
  const reward = campaign.cost_per_click * 0.6;
  const balanceField = campaign.currency === 'GRAM' ? 'balance_gram' : 'balance_usdt';

  // هـ) إيداع المكافأة ورصد إكمال المهمة
  const { data: user } = await supabase.from('users').select(balanceField).eq('telegram_id', telegramId).single();
  const currentBalance = user ? Number(user[balanceField] || 0) : 0;

  await supabase.from('users').update({ [balanceField]: currentBalance + reward }).eq('telegram_id', telegramId);

  await supabase.from('nera_completed_tasks').insert([{
    user_id: telegramId,
    campaign_id: campaignId,
    reward_amount: reward
  }]);

  // و) تحديث إحصائيات الحملة وإغلاقها عند اكتمال عدد النقرات
  const updatedClicks = campaign.completed_clicks + 1;
  await supabase.from('nera_campaigns').update({
    completed_clicks: updatedClicks,
    status: updatedClicks >= campaign.total_clicks ? 'completed' : 'active'
  }).eq('id', campaignId);

  res.json({ success: true, reward, currency: campaign.currency });
});

module.exports = router;
