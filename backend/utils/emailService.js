const nodemailer = require('nodemailer');
const logger = require('./logger');

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

const sendOTPEmail = async (email, otp, name) => {
  try {
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Digital Wallet Account',
      html: `
        <h2>Hello ${name},</h2>
        <p>Your OTP for Digital Wallet verification is:</p>
        <h1 style="letter-spacing:5px;">${otp}</h1>
        <p>This OTP is valid for <b>10 minutes</b>.</p>
        <p>Do not share this OTP with anyone.</p>
        <br/>
        <p>Digital Wallet Team</p>
      `
    });

    logger.info('OTP email sent: %s', info.messageId);
    return info;
  } catch (error) {
    logger.error('OTP email error: %s', error.message);
    throw new Error('OTP email failed');
  }
};

const sendTransactionEmail = async (email, name, transactionData) => {
  try {
    const transporter = createTransporter();
    const directionLabel = transactionData.direction === 'RECEIVED' ? 'credited to' : 'debited from';

    await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Transaction Alert - Digital Wallet',
      html: `
        <h2>Hello ${name},</h2>
        <p>Your wallet was successfully ${directionLabel}.</p>
        <ul>
          <li><b>Transaction ID:</b> ${transactionData.transactionId}</li>
          <li><b>Amount:</b> Rs ${Number(transactionData.amount).toLocaleString('en-IN')}</li>
          <li><b>Type:</b> ${transactionData.direction}</li>
          <li><b>Counterparty:</b> ${transactionData.counterpartyName}</li>
          <li><b>Description:</b> ${transactionData.description || '-'}</li>
          <li><b>Updated Balance:</b> Rs ${Number(transactionData.balance).toLocaleString('en-IN')}</li>
        </ul>
        <p>If this was not you, contact support immediately.</p>
        <br/>
        <p>Digital Wallet Team</p>
      `
    });
  } catch (error) {
    logger.warn('Transaction email error: %s', error.message);
  }
};

const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Digital Wallet',
      html: `<h2>Welcome ${name}!</h2><p>Your account is verified.</p>`
    });
  } catch (error) {
    logger.warn('Welcome email error: %s', error.message);
  }
};

const sendResetPasswordEmail = async (email, name, resetLink) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your Digital Wallet Password',
      html: `
        <h2>Hello ${name},</h2>
        <p>You requested to reset your Digital Wallet password.</p>
        <p>Click the link below to set a new password (valid for <b>15 minutes</b>):</p>
        <p><a href="${resetLink}" target="_blank" rel="noopener noreferrer">Reset Password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <br/>
        <p>Digital Wallet Team</p>
      `
    });
  } catch (error) {
    logger.error('Reset password email error: %s', error.message);
    throw new Error('Reset password email failed');
  }
};

module.exports = {
  sendOTPEmail,
  sendTransactionEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail
};
