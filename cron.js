import cron from 'node-cron';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { google } from 'googleapis';
import User from './models/User.js';
import EmailLog from './models/EmailLog.js';
import SMSLog from './models/SMSLog.js';

// ── Nodemailer fallback transport ─────────────────────
import {
  transporter,
  getTwilioClient,
  buildOAuth2Client,
  encodeEmail
} from './config/messaging.js';

// ── Send via Gmail API (OAuth) with Netlify Relay fallback ─
const sendViaOAuthOrFallback = async ({ adminUser, to, subject, html, type, userId }) => {
  // Try Gmail API first if admin has connected Gmail
  if (adminUser?.gmail_connected && adminUser?.refresh_token) {
    try {
      const auth  = buildOAuth2Client(adminUser);
      const gmail = google.gmail({ version: 'v1', auth });
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodeEmail({ from: adminUser.gmail_email, to, subject, body: html }),
        },
      });
      await EmailLog.create({ userId, to, subject, type, status: 'sent' });
      console.log(`✉️  [OAuth] Email sent to ${to}`);
      return true;
    } catch (err) {
      console.error(`⚠️  OAuth send failed for ${to}, falling back: ${err.message}`);
    }
  }

  // Fallback: Netlify Serverless Relay Function (Bypasses Render SMTP Firewall)
  if (!process.env.PLATFORM_EMAIL || !process.env.PLATFORM_EMAIL_PASSWORD) {
    await EmailLog.create({ userId, to, subject, type, status: 'failed', error: 'Missing PLATFORM_EMAIL in environment variables' });
    return false;
  }
  
  try {
    const https = await import('https');
    const data = JSON.stringify({
      secretKey: 'super_secret_netlify_bypass_key_for_click2web',
      to: to,
      subject: subject,
      html: html,
      user: process.env.PLATFORM_EMAIL,
      pass: process.env.PLATFORM_EMAIL_PASSWORD
    });

    const netlifyHost = 'click2website.netlify.app';
    
    const options = {
      hostname: netlifyHost,
      port: 443,
      path: '/.netlify/functions/send-email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => responseBody += chunk);
        res.on('end', async () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            await EmailLog.create({ userId, to, subject, type, status: 'sent' });
            console.log(`✉️  [Netlify Relay] Email sent to ${to}`);
            resolve(true);
          } else {
            console.error(`❌ Relay Error HTTP ${res.statusCode}: ${responseBody}`);
            await EmailLog.create({ userId, to, subject, type, status: 'failed', error: `Netlify Relay Error HTTP ${res.statusCode}: ${responseBody}` });
            resolve(false);
          }
        });
      });

      req.on('error', async (err) => {
        await EmailLog.create({ userId, to, subject, type, status: 'failed', error: 'Netlify Relay Request Error: ' + err.message });
        resolve(false);
      });

      req.write(data);
      req.end();
    });

  } catch (err) {
    await EmailLog.create({ userId, to, subject, type, status: 'failed', error: 'Netlify Setup Error: ' + err.message });
    return false;
  }
};

// ── Welcome Email Template ─────────────────────────────
const buildWelcomeEmailHtml = (user, trackingUrl) => `
<div style="font-family: Arial, sans-serif; font-size: 16px; color: #000;">
  <p><strong>Hi Welcome, ${user.name}! 🚀</strong></p>
  <br/>
  <p>You have successfully registered on our website.</p>
  <br/>
  <p>You are very close to getting your requirement website! Our team will review your details and get in touch with you shortly to build your dream project.</p>
  <br/>
  <p>Contact us: <a href="mailto:sasindragandla@gmail.com">sasindragandla@gmail.com</a> | <a href="tel:+919959732476">+91 9959732476</a></p>
  <br/><br/>
  <p>Cheers,<br/>The Web Development Team</p>
  <!-- Tracking Pixel -->
  <img src="${trackingUrl}" width="1" height="1" alt="" style="display:none;" />
</div>
`;

// ── Follow-up Reminder Template ────────────────────────
const buildFollowupEmailHtml = (user, reminderCount, trackingUrl) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4ff; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 30px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #5b21b6 0%, #1d4ed8 100%); padding: 30px 30px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 20px; font-weight: 800; }
    .body { padding: 32px 28px; }
    .greeting { font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 14px; }
    .message { font-size: 14px; color: #4a4a6a; line-height: 1.75; margin-bottom: 20px; }
    .cta-btn { display: block; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: #ffffff !important; text-align: center; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; text-decoration: none; margin: 24px 0; }
    .footer { background: #fafafa; padding: 18px 28px; border-top: 1px solid #e5e7eb; text-align: center; }
    .footer p { font-size: 12px; color: #9ca3af; }
    @media (max-width: 600px) { .body { padding: 20px 14px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌐 Click2Website — A Gentle Reminder</h1>
    </div>
    <div class="body">
      <p class="greeting">Hi ${user.name.split(' ')[0]}, your success is our priority! 👋</p>
      <p class="message">
        We noticed that our welcome email might have slipped through the cracks — inboxes get busy!
        We're following up because we genuinely want to help you build something amazing online.
      </p>
      <p class="message">
        🕐 This is reminder <strong>#${reminderCount}</strong>. Your website is waiting to be built!
      </p>
      <a href="https://click2website.netlify.app/contact" class="cta-btn">💬 Let's Talk — Schedule a Free Call</a>
      <p class="message" style="font-size:13px; color:#9ca3af; text-align:center;">
        Questions? Reach us at <strong>sasindragandla@gmail.com</strong>
      </p>
    </div>
    <div class="footer">
      <p>© 2026 Click2Website — We're here to grow your business 🚀</p>
    </div>
  </div>
  <img src="${trackingUrl}" width="1" height="1" alt="" style="display:none;" />
</body>
</html>
`;

// ── CRON: Every hour — Email & SMS Follow-up ───────────
cron.schedule('0 * * * *', async () => {
  console.log('⏰ [CRON] Running Automation: Email & SMS Follow-up Check...');

  try {
    // Find the admin user to use their Gmail OAuth for sending
    const adminUser = await User.findOne({ role: 'admin' });

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const fourHoursAgo  = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const API_URL       = process.env.API_URL || 'https://click2website-backend.onrender.com';

    const unengagedUsers = await User.find({
      role: 'user',
      welcomeEmailOpened: false,
      automationPaused: false,
    });

    for (const user of unengagedUsers) {
      const now = new Date();

      // ── EMAIL FOLLOW-UP (every 3 hours) ──────────────
      const lastReminder = user.lastReminderAt;
      const canSendEmail =
        !lastReminder
          ? user.createdAt <= threeHoursAgo
          : (now - lastReminder) >= 3 * 60 * 60 * 1000;

      if (canSendEmail) {
        const newCount    = (user.reminderCount || 0) + 1;
        const trackingUrl = `${API_URL}/api/auth/track-welcome/${user._id}`;

        // Send Email Reminder
        const sent = await sendViaOAuthOrFallback({
          adminUser,
          to:      user.email,
          subject: `⏰ Reminder #${newCount}: Your website is waiting, ${user.name.split(' ')[0]}!`,
          html:    buildFollowupEmailHtml(user, newCount, trackingUrl),
          type:    'reminder',
          userId:  user._id,
        });

        if (sent) {
          user.lastReminderAt = now;
          user.reminderCount  = newCount;
          await user.save();
        }

        // Send SMS Reminder
        if (user.phone) {
          const formattedPhone = user.phone.startsWith('+') ? user.phone : '+' + user.phone;
          const smsBody = `Hi ${user.name.split(' ')[0]}! 👋 (Reminder #${newCount})\nWe noticed you missed our welcome email.\nYour website is waiting! https://click2website.netlify.app`;
          
          const client = getTwilioClient();
          if (!client) {
            await SMSLog.create({ userId: user._id, to: formattedPhone, body: smsBody, type: 'auto', sentBy: 'system', status: 'failed', error: 'Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in Render variables' });
          } else {
            try {
              const waFrom = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;
              const waTo   = `whatsapp:${formattedPhone}`;
              
              await client.messages.create({
                body: smsBody,
                from: waFrom,
                to:   waTo,
              });
              await SMSLog.create({ userId: user._id, to: formattedPhone, body: smsBody, type: 'auto', sentBy: 'system', status: 'sent' });
              console.log(`📱 WhatsApp reminder #${newCount} sent to ${user.phone}`);
            } catch (err) {
              await SMSLog.create({ userId: user._id, to: formattedPhone, body: smsBody, type: 'auto', sentBy: 'system', status: 'failed', error: err.message });
            }
          }
        }
      }
    }

    console.log(`✅ [CRON] Automation complete. Processed ${unengagedUsers.length} unengaged users.`);
  } catch (err) {
    console.error('❌ [CRON] Automation Error:', err.message);
  }
});

// ── Send Welcome Email immediately on signup ───────────
export const sendWelcomeEmail = async (user) => {
  const API_URL     = process.env.API_URL || 'https://click2website-backend.onrender.com';
  const trackingUrl = `${API_URL}/api/auth/track-welcome/${user._id}`;

  const adminUser = await User.findOne({ role: 'admin' }).catch(() => null);

  await sendViaOAuthOrFallback({
    adminUser,
    to:      user.email,
    subject: `🎉 Welcome to Click2Website! Let's build your dream website.`,
    html:    buildWelcomeEmailHtml(user, trackingUrl),
    type:    'welcome',
    userId:  user._id,
  });
};

// ── Send Welcome SMS immediately on signup ─────────────
export const sendWelcomeSMS = async (user) => {
  if (!user.phone) return;
  const client = getTwilioClient();
  
  const formattedPhone = user.phone.startsWith('+') ? user.phone : '+' + user.phone;
  const smsBody = `Hi ${user.name.split(' ')[0]}! Welcome to Click2Website 🚀. \nWe will review your details and contact you shortly to build your dream project!\n- The Web Dev Team`;

  if (!client) {
    await SMSLog.create({ userId: user._id, to: formattedPhone, body: smsBody, type: 'auto', sentBy: 'system', status: 'failed', error: 'Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in Render environment variables' });
    return;
  }

  try {
    const waFrom = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;
    const waTo   = `whatsapp:${formattedPhone}`;

    await client.messages.create({
      body: smsBody,
      from: waFrom,
      to:   waTo,
    });
    await SMSLog.create({ userId: user._id, to: formattedPhone, body: smsBody, type: 'auto', sentBy: 'system', status: 'sent' });
  } catch (err) {
    await SMSLog.create({ userId: user._id, to: formattedPhone, body: smsBody, type: 'auto', sentBy: 'system', status: 'failed', error: err.message });
  }
};

// ── Send Login Alert Email on login ───────────────────
export const sendLoginAlertEmail = async (user) => {
  const adminUser = await User.findOne({ role: 'admin' }).catch(() => null);

  await sendViaOAuthOrFallback({
    adminUser,
    to:      user.email,
    subject: `🚨 New Login to your Click2Website Account`,
    html: `
      <div style="font-family:Arial,sans-serif;padding:24px;max-width:500px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#1a1a2e;margin-top:0;">New Login Detected</h2>
        <p style="color:#4b5563;line-height:1.6;">
          Hi ${user.name.split(' ')[0]},<br><br>
          We noticed a new login to your Click2Website account just now.
        </p>
        <p style="color:#4b5563;line-height:1.6;">
          If this was you, you can safely ignore this email. If you did not authorize this login, please contact us immediately.
        </p>
        <p style="font-size:12px;color:#9ca3af;margin-top:30px;border-top:1px solid #e5e7eb;padding-top:16px;">
          © ${new Date().getFullYear()} Click2Website Security
        </p>
      </div>
    `,
    type:   'login-alert',
    userId: user._id,
  });
};

console.log('✅ Cron Jobs Initialized — OAuth Email & Twilio SMS automation active.');
