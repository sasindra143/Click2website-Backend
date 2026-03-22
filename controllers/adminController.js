import twilio from 'twilio';
import User from '../models/User.js';

const getTwilioClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('your_')) return null;
  return twilio(sid, token);
};

/* ── GET /api/admin/users ── */
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('Fetch users error:', err.message);
    res.status(500).json({ message: 'Server error fetching users' });
  }
};

/* ── DELETE /api/admin/users/:id ── */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'admin' && req.user._id.toString() === user._id.toString())
      return res.status(400).json({ message: 'Cannot delete your own admin account.' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed successfully' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ message: 'Server error deleting user' });
  }
};

/* ── PATCH /api/admin/users/:id/pause-automation ── */
export const toggleAutomation = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.automationPaused = !user.automationPaused;
    await user.save();

    res.json({
      message: user.automationPaused
        ? `Automation paused for ${user.name}`
        : `Automation resumed for ${user.name}`,
      automationPaused: user.automationPaused,
    });
  } catch (err) {
    console.error('Toggle automation error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── POST /api/admin/users/:id/send-sms ── */
export const sendCustomSMS = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.phone)
      return res.status(400).json({ message: 'User has no phone number on file' });

    const client = getTwilioClient();
    if (!client) return res.status(503).json({ message: 'Twilio not configured' });

    const formattedPhone = user.phone.startsWith('+') ? user.phone : '+' + user.phone;
    await client.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to:   `whatsapp:${formattedPhone}`,
    });

    // Increment admin's smsSent counter
    await User.findByIdAndUpdate(req.user._id, { $inc: { smsSent: 1 } });
    // Mark automation as paused since admin sent a custom override
    user.automationPaused = true;
    await user.save();

    res.json({ message: `Custom SMS sent to ${user.name} (${user.phone})` });
  } catch (err) {
    console.error('Custom SMS error:', err.message);
    res.status(500).json({ message: 'Failed to send SMS', error: err.message });
  }
};

/* ── GET /api/admin/stats ── */
export const getDashboardStats = async (req, res) => {
  try {
    const total         = await User.countDocuments({ role: 'user' });
    const openedEmail   = await User.countDocuments({ welcomeEmailOpened: true });
    const paused        = await User.countDocuments({ automationPaused: true });
    const smsSent       = await User.countDocuments({ smsFollowupSent: true });
    const recent7Days   = await User.countDocuments({
      role: 'user',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });

    res.json({
      total,
      openedEmail,
      paused,
      smsSent,
      recent7Days,
      openRate: total > 0 ? Math.round((openedEmail / total) * 100) : 0,
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
