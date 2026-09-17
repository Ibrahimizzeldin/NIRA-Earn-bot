const express = require('express');
const router = express.Router();
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
    .update({ [balanceField]: user[balanceField] - totalCost })
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

module.exports = router;
            
