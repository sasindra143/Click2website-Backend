import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { google } from 'googleapis';

// ── Shared Nodemailer Transporter ──────────────────────
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PLATFORM_EMAIL,
    pass: process.env.PLATFORM_EMAIL_PASSWORD,
  },
});

// ── Shared Twilio Helper ───────────────────────────────
export const getTwilioClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('your_')) return null;
  return twilio(sid, token);
};

// ── Shared OAuth2 Client Builder ───────────────────────
export const buildOAuth2Client = (user) => {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({
    access_token:  user.access_token,
    refresh_token: user.refresh_token,
    expiry_date:   user.token_expiry ? user.token_expiry.getTime() : undefined,
  });
  return auth;
};

// ── Shared Email Encoder ───────────────────────────────
export const encodeEmail = ({ from, to, subject, body }) => {
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
