const nodemailer = require("nodemailer");

/* ================= CREATE TRANSPORTER ================= */

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });
};

/* ================= SEND OTP EMAIL ================= */

const sendOTPEmail = async (email, otp, name) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Digital Wallet Account",
      html: `
        <h2>Hello ${name},</h2>
        <p>Your OTP for Digital Wallet verification is:</p>
        <h1 style="letter-spacing:5px;">${otp}</h1>
        <p>This OTP is valid for <b>10 minutes</b>.</p>
        <p>Do not share this OTP with anyone.</p>
        <br/>
        <p>— Digital Wallet Team</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ OTP email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ OTP email error:", error);
    throw new Error("OTP email failed");
  }
};

/* ================= TRANSACTION EMAIL ================= */

const sendTransactionEmail = async (email, name, transactionData) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Transaction Alert",
      html: `<p>Hello ${name},</p><p>Your transaction was successful.</p>`,
    });
  } catch (error) {
    console.error("❌ Transaction email error:", error);
  }
};

/* ================= WELCOME EMAIL ================= */

const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to Digital Wallet",
      html: `<h2>Welcome ${name}!</h2><p>Your account is verified.</p>`,
    });
  } catch (error) {
    console.error("❌ Welcome email error:", error);
  }
};

/* ================= RESET PASSWORD EMAIL ================= */

const sendResetPasswordEmail = async (email, name, resetLink) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Digital Wallet" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Reset Your Digital Wallet Password",
      html: `
        <h2>Hello ${name},</h2>
        <p>You requested to reset your Digital Wallet password.</p>
        <p>Click the link below to set a new password (valid for <b>15 minutes</b>):</p>
        <p><a href="${resetLink}" target="_blank" rel="noopener noreferrer">Reset Password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <br/>
        <p>— Digital Wallet Team</p>
      `,
    });
  } catch (error) {
    console.error("❌ Reset password email error:", error);
    throw new Error("Reset password email failed");
  }
};

module.exports = {
  sendOTPEmail,
  sendTransactionEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
};
