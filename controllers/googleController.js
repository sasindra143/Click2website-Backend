import { google } from 'googleapis';
import User from '../models/User.js';

const makeOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/* ── GET /api/google/auth-url ── */
export const getAuthUrl = (req, res) => {
  const client = makeOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: req.user._id.toString(),
  });
  res.json({ url });
};

/* ── GET /api/google/callback ── */
export const handleCallback = async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId)
    return res.redirect(`${process.env.CLIENT_URL}/dashboard?google=error&reason=missing_params`);

  try {
    const client = makeOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2Api.userinfo.get();

    await User.findByIdAndUpdate(userId, {
      gmail_email:   data.email,
      avatar:        data.picture,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      token_expiry:  tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      gmail_connected: true,
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard?google=success`);
  } catch (err) {
    console.error('Google callback error:', err.message);
    res.redirect(`${process.env.CLIENT_URL}/dashboard?google=error`);
  }
};

/* ── POST /api/google/disconnect ── */
export const disconnect = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      gmail_email: null, access_token: null, refresh_token: null,
      token_expiry: null, gmail_connected: false,
    });
    res.json({ message: 'Gmail disconnected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── GET /api/google/status ── */
export const getStatus = async (req, res) => {
  const user = await User.findById(req.user._id).select('gmail_connected gmail_email');
  res.json({ connected: user.gmail_connected, gmail_email: user.gmail_email || null });
};
