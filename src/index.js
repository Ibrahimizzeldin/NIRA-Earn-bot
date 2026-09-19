const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// تعريف محفظة جرام الرئيسية للمشروع (تستقبل TON و USDT)
const ADMIN_WALLET_ADDRESS = process.env.VITE_ADMIN_WALLET_ADDRESS || "UQCx6wbqhw4II0OfHhvR4lo9S6Zs4xGSejRqctmACnZ92D5k";

// مسار رئيسي للتحقق من إعدادات الخزينة والمحفظة الموحدة للمشروع
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    adminWallet: ADMIN_WALLET_ADDRESS,
    supportedCurrencies: ["TON", "USDT"],
    network: "TON"
  });
});

// مسارات API للحملات الإعلانية
app.use('/api/campaigns', require('./routes/campaigns'));

// تصدير التطبيق لتشغيله كـ Serverless Function على Vercel
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Project Treasury Wallet (Gram & USDT): ${ADMIN_WALLET_ADDRESS}`);
  });
}
