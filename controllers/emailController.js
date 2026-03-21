import { google } from 'googleapis';
import User from '../models/User.js';

const buildOAuth2Client = (user) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({
    access_token:  user.access_token,
    refresh_token: user.refresh_token,
    expiry_date:   user.token_expiry ? user.token_expiry.getTime() : undefined,
  });
  return client;
};

const encodeEmail = ({ from, to, subject, body }) => {
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(raw).toString('base64url');
};

/* ── POST /api/email/send ── */
export const sendEmail = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.gmail_connected || !user.access_token)
      return res.status(403).json({ message: 'Gmail not connected. Please connect Gmail first.' });

    const { to, subject, body } = req.body;
    if (!to || !subject || !body)
      return res.status(400).json({ message: 'to, subject, and body are required' });

    const auth  = buildOAuth2Client(user);
    const gmail = google.gmail({ version: 'v1', auth });

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodeEmail({ from: user.gmail_email, to, subject, body }) },
    });

    await User.findByIdAndUpdate(user._id, { $inc: { emailsSent: 1 } });
    res.json({ message: 'Email sent successfully' });
  } catch (err) {
    console.error('Email send error:', err.message);
    if (err.code === 401) return res.status(401).json({ message: 'Gmail token expired. Reconnect Gmail.' });
    res.status(500).json({ message: 'Failed to send email', error: err.message });
  }
};

/* ── GET /api/email/stats ── */
export const getEmailStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('emailsSent gmail_connected gmail_email');
    res.json({ emailsSent: user.emailsSent, gmail_connected: user.gmail_connected, gmail_email: user.gmail_email });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── GET /api/email/inbox ── */
export const getInbox = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.gmail_connected || !user.access_token)
      return res.status(403).json({ message: 'Gmail not connected. Please connect Gmail first.' });

    const auth  = buildOAuth2Client(user);
    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      maxResults: 15,
    });

    const messages = response.data.messages || [];
    
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        const msgDetail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });
        
        const headers = msgDetail.data.payload.headers;
        return {
          id: msg.id,
          snippet: msgDetail.data.snippet,
          subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find(h => h.name === 'From')?.value || 'Unknown Sender',
          date: headers.find(h => h.name === 'Date')?.value || '',
        };
      })
    );

    res.json(detailedMessages);
  } catch (err) {
    console.error('Inbox fetch error:', err.message);
    if (err.code === 401) return res.status(401).json({ message: 'Gmail token expired. Reconnect Gmail.' });
    res.status(500).json({ message: 'Failed to fetch inbox', error: err.message });
  }
};
