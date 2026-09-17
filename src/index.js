const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// تقديم الملفات الثابتة من مجلد public
app.use(express.static(path.join(__dirname, '../public')));

// مسارات API للحملات الإعلانية
app.use('/api/campaigns', require('./routes/campaigns'));

// المسار الرئيسي لتشغيل الواجهة
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// تصدير التطبيق لدعم Vercel
module.exports = app;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
