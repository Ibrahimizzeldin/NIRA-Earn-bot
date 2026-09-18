const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// تهيئة اتصال Supabase باستخدام متغيرات البيئة المخزنة في Vercel
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// مسار جلب جميع الحملات الإعلانية بشكل صحيح مطابق للجدول
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*');

    if (error) {
      throw error;
    }

    // إرجاع البيانات بصيغة JSON سليمة للواجهة الأمامية
    res.json(data);
  } catch (err) {
    console.error('خطأ في جلب الحملات:', err.message);
    res.status(500).json({ error: 'خطأ في تحميل الحملات' });
  }
});

// مسار إضافة حملة جديدة
router.post('/', async (req, res) => {
  try {
    const { title, url, type, currency, clicks_required } = req.body;

    const { data, error } = await supabase
      .from('campaigns')
      .insert([{ title, url, type, currency, clicks_required }]);

    if (error) {
      throw error;
    }

    res.status(201).json({ message: 'تم إنشاء الحملة بنجاح', data });
  } catch (err) {
    console.error('خطأ في إنشاء الحملة:', err.message);
    res.status(500).json({ error: 'فشل إنشاء الحملة' });
  }
});

module.exports = router;
