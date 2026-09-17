const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// مسارات API للحملات الإعلانية
app.use('/api/campaigns', require('./routes/campaigns'));

// تصدير التطبيق لتشغيله كـ Serverless Function على Vercel
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
