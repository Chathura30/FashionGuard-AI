const nodemailer = require('nodemailer');

/**
 * Create email transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

/**
 * Email templates
 */
const templates = {
  verification: (data) => ({
    subject: 'Welcome to FashionGuard - Verify Your Email',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { padding: 40px; }
          .content h2 { color: #1a202c; font-size: 24px; margin-bottom: 20px; }
          .content p { color: #4a5568; line-height: 1.6; margin-bottom: 20px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; color: #718096; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ FashionGuard</h1>
          </div>
          <div class="content">
            <h2>Welcome, ${data.name}!</h2>
            <p>Thank you for joining FashionGuard - your secure platform for protecting digital fashion designs.</p>
            <p>Please verify your email address to get started:</p>
            <a href="${data.verificationUrl}" class="btn">Verify Email Address</a>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 FashionGuard. All rights reserved.</p>
            <p>Protecting your creative work with AI-powered security.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  passwordReset: (data) => ({
    subject: 'FashionGuard - Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { padding: 40px; }
          .content h2 { color: #1a202c; font-size: 24px; margin-bottom: 20px; }
          .content p { color: #4a5568; line-height: 1.6; margin-bottom: 20px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .warning { background: #fff5f5; border-left: 4px solid #f56565; padding: 15px; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; color: #718096; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset</h1>
          </div>
          <div class="content">
            <h2>Hello, ${data.name}</h2>
            <p>We received a request to reset your FashionGuard password.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${data.resetUrl}" class="btn">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> If you didn't request a password reset, please ignore this email and ensure your account is secure.
            </div>
          </div>
          <div class="footer">
            <p>&copy; 2024 FashionGuard. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  mfaEnabled: (data) => ({
    subject: 'FashionGuard - Two-Factor Authentication Enabled',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { padding: 40px; }
          .content h2 { color: #1a202c; font-size: 24px; margin-bottom: 20px; }
          .content p { color: #4a5568; line-height: 1.6; margin-bottom: 20px; }
          .success { background: #f0fff4; border-left: 4px solid #48bb78; padding: 15px; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; color: #718096; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ MFA Enabled</h1>
          </div>
          <div class="content">
            <h2>Great news, ${data.name}!</h2>
            <div class="success">
              <strong>🎉 Success:</strong> Two-factor authentication has been enabled on your account.
            </div>
            <p>Your account is now more secure. You'll need to enter a verification code from your authenticator app each time you log in.</p>
            <p>Make sure to keep your backup codes in a safe place!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 FashionGuard. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  loginAlert: (data) => ({
    subject: 'FashionGuard - New Login Detected',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { padding: 40px; }
          .content h2 { color: #1a202c; font-size: 24px; margin-bottom: 20px; }
          .content p { color: #4a5568; line-height: 1.6; margin-bottom: 20px; }
          .info-box { background: #ebf8ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .info-box p { margin: 5px 0; }
          .btn { display: inline-block; background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; color: #718096; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Login Alert</h1>
          </div>
          <div class="content">
            <h2>Hello, ${data.name}</h2>
            <p>A new login was detected on your FashionGuard account:</p>
            <div class="info-box">
              <p><strong>📍 Location:</strong> ${data.location || 'Unknown'}</p>
              <p><strong>💻 Device:</strong> ${data.device || 'Unknown'}</p>
              <p><strong>🕐 Time:</strong> ${data.time}</p>
              <p><strong>🌐 IP Address:</strong> ${data.ip}</p>
            </div>
            <p>If this was you, you can ignore this email.</p>
            <p>If this wasn't you, please secure your account immediately:</p>
            <a href="${data.secureAccountUrl}" class="btn">Secure My Account</a>
          </div>
          <div class="footer">
            <p>&copy; 2024 FashionGuard. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

/**
 * Send email
 */
const sendEmail = async ({ to, subject, template, data }) => {
  try {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('Email not configured. Skipping email send.');
      return { success: false, message: 'Email not configured' };
    }

    const transporter = createTransporter();

    // Get template content
    let emailContent;
    if (template && templates[template]) {
      emailContent = templates[template](data);
    } else {
      emailContent = { subject, html: data.html || data.text };
    }

    const mailOptions = {
      from: `"FashionGuard" <${process.env.EMAIL_USER}>`,
      to,
      subject: emailContent.subject,
      html: emailContent.html
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };
