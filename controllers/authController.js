import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User.js';
import Token from '../models/Token.js';
import { sendWelcomeEmail, sendWelcomeSMS, sendLoginAlertEmail } from '../cron.js';

// Allowed Firebase Admin Email
const ADMIN_EMAIL = 'sasindragandla@gmail.com';

const generateAccessToken  = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
const generateRefreshToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Configure Platform Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PLATFORM_EMAIL,
    pass: process.env.PLATFORM_EMAIL_PASSWORD,
  },
});

/* ── Register (auto-login after registration) ── */
export const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    if (await User.findOne({ email }))
      return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password, phone: phone || null });

    // Send the professional branded Welcome Email and SMS (non-blocking)
    sendWelcomeEmail(user).catch(console.error);
    sendWelcomeSMS(user).catch(console.error);

    // Auto-login: return tokens immediately
    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await Token.create({
      userId: user._id, token: refreshToken, type: 'refresh',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({
      _id: user._id, name: user.name, email: user.email,
      role: user.role, phone: user.phone,
      accessToken, refreshToken,
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── Login ── */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: 'Invalid email address format' });

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid email or password' });

    user.lastLogin = new Date();
    await user.save();

    // Send Login Alert Email (non-blocking)
    sendLoginAlertEmail(user).catch(console.error);

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await Token.create({
      userId: user._id, token: refreshToken, type: 'refresh',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({
      _id: user._id, name: user.name, email: user.email, role: user.role,
      avatar: user.avatar, phone: user.phone, lastLogin: user.lastLogin,
      gmail_connected: user.gmail_connected, accessToken, refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── Refresh ── */
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    const stored = await Token.findOne({ token: refreshToken, type: 'refresh' });
    if (!stored) return res.status(403).json({ message: 'Invalid refresh token' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    res.json({ accessToken: generateAccessToken(decoded.id) });
  } catch (err) {
    res.status(403).json({ message: 'Refresh token expired or invalid' });
  }
};

/* ── Firebase Admin Login ── */
import admin from '../config/firebaseAdmin.js';

export const firebaseAdminLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(401).json({ message: 'No authentication token provided.' });

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (firebaseErr) {
      console.error('Firebase Token Verification Error:', firebaseErr.message);
      return res.status(403).json({ message: 'Invalid or expired Firebase token.' });
    }

    const { email, name: displayName, picture: photoURL } = decodedToken;

    if (email !== ADMIN_EMAIL)
      return res.status(403).json({ message: 'Access Denied: You are not authorized as Admin.' });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: displayName || 'Click2Website Admin',
        email,
        password: await bcrypt.hash(Math.random().toString(36), 10),
        role: 'admin',
        avatar: photoURL || '',
      });
    } else {
      if (photoURL && user.avatar !== photoURL) user.avatar = photoURL;
    }

    if (user.role !== 'admin') user.role = 'admin';
    user.lastLogin = new Date();
    await user.save();

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await Token.create({
      userId: user._id, token: refreshToken, type: 'refresh',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, lastLogin: user.lastLogin, accessToken, refreshToken });
  } catch (err) {
    console.error('Firebase login error:', err.message);
    res.status(500).json({ message: 'Server error during Firebase login' });
  }
};

/* ── Logout ── */
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await Token.deleteOne({ token: refreshToken });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── Me ── */
export const getMe = async (req, res) => {
  const u = req.user;
  res.json({
    _id: u._id, name: u.name, email: u.email, role: u.role,
    avatar: u.avatar, phone: u.phone, lastLogin: u.lastLogin,
    gmail_connected: u.gmail_connected, gmail_email: u.gmail_email,
    emailsSent: u.emailsSent, smsSent: u.smsSent, createdAt: u.createdAt,
  });
};

/* ── Update Profile ── */
export const updateProfile = async (req, res) => {
  try {
    const { name, email, phone, avatar } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ message: 'Email is already in use by another account' });
      user.email = email;
    }

    if (name)   user.name   = name;
    if (phone !== undefined) user.phone  = phone;
    if (avatar) user.avatar = avatar;
    await user.save();

    res.json({
      _id: user._id, name: user.name, email: user.email, role: user.role,
      avatar: user.avatar, phone: user.phone,
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── Forgot Password ── */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    // Always return 200 to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    // Generate a secure random token
    const resetToken  = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save as a 'reset' token valid for 1 hour
    await Token.deleteMany({ userId: user._id, type: 'reset' }); // clean up old tokens
    await Token.create({
      userId:    user._id,
      token:     hashedToken,
      type:      'reset',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    const resetUrl = `${process.env.CLIENT_URL || 'https://click2website.netlify.app'}/reset-password/${resetToken}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4ff; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 30px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7c3aed, #3b82f6); padding: 36px 28px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 800; }
    .lock { font-size: 40px; margin-bottom: 12px; }
    .body { padding: 32px 28px; }
    .title { font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; }
    .text { font-size: 14px; color: #4a4a6a; line-height: 1.7; margin-bottom: 24px; }
    .btn { display: block; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: #fff !important; text-align: center; padding: 16px 28px; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; margin-bottom: 24px; }
    .warning { background: #fff8f0; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #92400e; }
    .footer { background: #fafafa; border-top: 1px solid #e5e7eb; padding: 18px 28px; text-align: center; font-size: 12px; color: #9ca3af; }
    @media (max-width: 600px) { .body, .header { padding: 22px 16px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="lock">🔐</div>
      <h1>Click2Website — Password Reset</h1>
    </div>
    <div class="body">
      <p class="title">Hi ${user.name.split(' ')[0]}, reset your password</p>
      <p class="text">
        We received a request to reset the password for your Click2Website account.
        Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}" class="btn">🔑 Reset My Password</a>
      <div class="warning">
        ⚠️ If you didn't request this, please ignore this email. Your account is safe.
        Never share this link with anyone.
      </div>
    </div>
    <div class="footer">
      <p>© 2026 Click2Website — sasindragandla@gmail.com</p>
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from:    `"Click2Website Security" <${process.env.PLATFORM_EMAIL}>`,
      to:      user.email,
      subject: '🔐 Reset Your Click2Website Password',
      html,
    });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── Reset Password ── */
export const resetPassword = async (req, res) => {
  try {
    const { token }    = req.params;
    const { password } = req.body;

    if (!token || !password)
      return res.status(400).json({ message: 'Token and new password are required' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const stored      = await Token.findOne({
      token: hashedToken,
      type:  'reset',
      expiresAt: { $gt: new Date() },
    });

    if (!stored)
      return res.status(400).json({ message: 'Reset link is invalid or has expired. Please request a new one.' });

    const user = await User.findById(stored.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = password;
    await user.save();

    // Clean up the used token
    await Token.deleteOne({ _id: stored._id });

    // Send confirmation email
    transporter.sendMail({
      from:    `"Click2Website Security" <${process.env.PLATFORM_EMAIL}>`,
      to:      user.email,
      subject: '✅ Your Click2Website Password Was Reset',
      html: `
        <div style="font-family:Arial,sans-serif;padding:28px;max-width:480px;margin:0 auto;border-radius:12px;background:#fff;">
          <div style="text-align:center;margin-bottom:20px;"><span style="font-size:36px;">✅</span></div>
          <h2 style="text-align:center;color:#1a1a2e;">Password Changed Successfully</h2>
          <p style="color:#6b7280;text-align:center;line-height:1.6;">
            Hi <strong>${user.name.split(' ')[0]}</strong>, your password was just changed.
            If this wasn't you, please contact us immediately at
            <a href="mailto:sasindragandla@gmail.com" style="color:#7c3aed;">sasindragandla@gmail.com</a>.
          </p>
          <div style="text-align:center;margin-top:24px;">
            <a href="https://click2website.netlify.app/login"
               style="background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;">
              Sign In Now →
            </a>
          </div>
        </div>
      `,
    }).catch(console.error);

    res.json({ message: 'Password reset successful! You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── Track Welcome Email (Hidden Pixel) ── */
export const trackWelcomeEmail = async (req, res) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { welcomeEmailOpened: true });

    const pixel = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': pixel.length });
    res.end(pixel);
  } catch (err) {
    res.status(500).send('');
  }
};
