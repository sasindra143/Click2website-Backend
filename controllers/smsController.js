import twilio from 'twilio';
import User from '../models/User.js';

const getClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('your_'))
    throw new Error('Twilio credentials not configured');
  return twilio(sid, token);
};

/* ── POST /api/sms/send ── */
export const sendSMS = async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message)
      return res.status(400).json({ message: 'to and message are required' });

    const client = getClient();
    await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER, to });

    await User.findByIdAndUpdate(req.user._id, { $inc: { smsSent: 1 } });
    res.json({ message: 'SMS sent successfully' });
  } catch (err) {
    console.error('SMS send error:', err.message);
    if (err.message === 'Twilio credentials not configured')
      return res.status(503).json({ message: 'SMS service not configured. Add Twilio credentials to .env' });
    res.status(500).json({ message: 'Failed to send SMS', error: err.message });
  }
};

/* ── GET /api/sms/stats ── */
export const getSmsStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('smsSent');
    res.json({ smsSent: user.smsSent });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
