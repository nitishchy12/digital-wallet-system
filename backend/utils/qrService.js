const QRCode = require('qrcode');

// Generate QR code for user payments
const generateQRCode = async (data) => {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });
    
    return qrCodeDataURL;
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw new Error('Failed to generate QR code');
  }
};

// Generate payment QR code with amount
const generatePaymentQR = async (userId, amount, description = '') => {
  try {
    const paymentData = {
      type: 'payment-request',
      userId,
      amount,
      description,
      timestamp: Date.now()
    };
    
    return await generateQRCode(JSON.stringify(paymentData));
  } catch (error) {
    console.error('Payment QR generation error:', error);
    throw new Error('Failed to generate payment QR code');
  }
};

// Parse QR code data
const parseQRData = (qrData) => {
  try {
    const parsed = JSON.parse(qrData);
    
    // Validate QR data structure
    if (!parsed.type || !parsed.userId) {
      throw new Error('Invalid QR code format');
    }
    
    return parsed;
  } catch (error) {
    console.error('QR parsing error:', error);
    throw new Error('Invalid QR code data');
  }
};

// Validate payment QR code
const validatePaymentQR = (qrData) => {
  try {
    const parsed = parseQRData(qrData);
    
    if (parsed.type !== 'payment-request' && parsed.type !== 'user-payment') {
      throw new Error('Invalid payment QR code');
    }
    
    // Check if QR code is not too old (24 hours)
    if (parsed.timestamp && (Date.now() - parsed.timestamp) > 24 * 60 * 60 * 1000) {
      throw new Error('QR code has expired');
    }
    
    return parsed;
  } catch (error) {
    console.error('QR validation error:', error);
    throw error;
  }
};

module.exports = {
  generateQRCode,
  generatePaymentQR,
  parseQRData,
  validatePaymentQR
};

