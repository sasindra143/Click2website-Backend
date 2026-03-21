import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import googleRoutes from './routes/googleRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import smsRoutes from './routes/smsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Connect to MongoDB
connectDB();

// Initialize Cron Jobs
import './cron.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Click2Website API is running 🚀' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Click2Website Server running on port ${PORT}`);
});

export default app;
