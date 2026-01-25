const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Return user without sensitive data
    const userData = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      isVerified: req.user.isVerified,
      isActive: req.user.isActive,
      role: req.user.role,
      qrCode: req.user.qrCode,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt
    };

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      code: 'PROFILE_FETCH_FAILED',
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user QR code
router.get('/qr-code', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      data: {
        qrCode: user.qrCode,
        qrData: user.generateQRData()
      }
    });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({
      success: false,
      code: 'QR_CODE_FETCH_FAILED',
      message: 'Failed to fetch QR code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;