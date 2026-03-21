import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import User from '../models/User.js';
import Token from '../models/Token.js';

// Allowed Firebase Admin Email
const ADMIN_EMAIL = 'sasindragandla@gmail.com';

const generateAccessToken  = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
const generateRefreshToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Configure Platform Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // Standard Gmail SMTP for platform emails
  auth: {
    user: process.env.PLATFORM_EMAIL,
    pass: process.env.PLATFORM_EMAIL_PASSWORD,
  },
});

/* ── Register ── */
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    if (await User.findOne({ email }))
      return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password });

    // Send Welcome Email
    if (process.env.PLATFORM_EMAIL && process.env.PLATFORM_EMAIL_PASSWORD) {
      try {
        await transporter.sendMail({
          from: `"Click2Website Team" <${process.env.PLATFORM_EMAIL}>`,
          to: user.email,
          subject: '🎉 Welcome to Click2Website! Let\'s build your dream website.',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
              <h2>Hi Welcome, ${user.name}! 🚀</h2>
              <p>You have successfully registered on our website.</p>
              <p>You are very close to getting your requirement website! Our team will review your details and get in touch with you shortly to build your dream project.</p>
              <br/><br/>
              <p>Cheers,<br/>The Web Development Team</p>
              <img src="${process.env.API_URL || 'http://localhost:5000'}/api/auth/track-welcome/${user._id}" width="1" height="1" alt="" />
            </div>
          `,
        });
        console.log(`Welcome email sent to ${user.email}`);
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr.message);
      }
    }

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await Token.create({
      userId: user._id, token: refreshToken, type: 'refresh',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, accessToken, refreshToken });
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

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid email or password' });

    user.lastLogin = new Date();
    await user.save();

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await Token.create({
      userId: user._id, token: refreshToken, type: 'refresh',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, lastLogin: user.lastLogin, gmail_connected: user.gmail_connected, accessToken, refreshToken });
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
export const firebaseAdminLogin = async (req, res) => {
  try {
    const { email, displayName, photoURL } = req.body;
    
    // Strict security check: only specific email is allowed
    if (email !== ADMIN_EMAIL) {
      return res.status(403).json({ message: 'Access Denied: You are not authorized as Admin.' });
    }

    let user = await User.findOne({ email });
    
    // Auto-create admin if it doesn't exist
    if (!user) {
      user = await User.create({
        name: displayName || 'Click2Website Admin',
        email,
        password: await bcrypt.hash(Math.random().toString(36), 10), // random junk password
        role: 'admin',
        avatar: photoURL || '',
      });
    } else if (photoURL && user.avatar !== photoURL) {
      user.avatar = photoURL;
    }

    // Ensure role is admin
    if (user.role !== 'admin') {
      user.role = 'admin';
    }
    
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
  res.json({ _id: u._id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, lastLogin: u.lastLogin, gmail_connected: u.gmail_connected, gmail_email: u.gmail_email, emailsSent: u.emailsSent, smsSent: u.smsSent, createdAt: u.createdAt });
};

/* ── Track Welcome Email (Hidden Pixel) ── */
export const trackWelcomeEmail = async (req, res) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { welcomeEmailOpened: true });
    
    // Return a 1x1 transparent GIF pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
    });
    res.end(pixel);
  } catch (err) {
    console.error('Tracking pixel error:', err.message);
    res.status(500).send('');
  }
};
