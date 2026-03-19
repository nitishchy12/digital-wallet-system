const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    const { refreshToken, password, ...safeUser } = req.user.toObject();

    return res.status(200).json({
      success: true,
      data: {
        user: safeUser
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/qr-code', authenticateToken, async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        qrCode: req.user.qrCode,
        qrData: req.user.generateQRData()
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
