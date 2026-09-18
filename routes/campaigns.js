const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// تهيئة اتصال Supabase باستخدام متغيرات البيئة المخزنة في Vercel
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// مسار جلب جميع الحملات الإعلانية
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // إرجاع البيانات بصيغة JSON لتعمل الواجهة مباشرة
    res.json(data);
  } catch (err) {
    console.error('خطأ في جلب الحملات:', err.message);
    res.status(500).json({ error: 'خطأ في تحميل الحملات' });
  }
});

module.exports = router;
