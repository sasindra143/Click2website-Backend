import cron from 'node-cron';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import User from './models/User.js';

// ── Email Transporter ──────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PLATFORM_EMAIL,
    pass: process.env.PLATFORM_EMAIL_PASSWORD,
  },
});

// ── Twilio Helper ──────────────────────────────────
const getTwilioClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('your_')) return null;
  return twilio(sid, token);
};

// ── Professional Welcome Email Template ───────────
const buildWelcomeEmailHtml = (user, trackingUrl) => `
<div style="font-family: Arial, sans-serif; font-size: 16px; color: #000;">
  <p><strong>Hi Welcome, ${user.name}! 🚀</strong></p>
  <br/>
  <p>You have successfully registered on our website.</p>
  <br/>
  <p>You are very close to getting your requirement website! Our team will review your details and get in touch with you shortly to build your dream project.</p>
  <br/><br/>
  <p>Cheers,<br/>The Web Development Team</p>
  <!-- Tracking Pixel -->
  <img src="${trackingUrl}" width="1" height="1" alt="" style="display:none;" />
</div>
`;

// ── Follow-up Email Template (3-hour loop) ─────────
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
        Your website is waiting to be built. Our team of expert developers is ready to create a
        <strong>fully responsive, SEO-optimized</strong> website that can grow your traffic by
        <strong>40%+</strong> from day one.
      </p>
      <p class="message">
        🕐 This is reminder <strong>#${reminderCount}</strong>. We'll keep checking on you until we hear back,
        because we truly believe in your vision.
      </p>
      <a href="https://click2website.netlify.app/contact" class="cta-btn">💬 Let's Talk — Schedule a Free Call</a>
      <p class="message" style="font-size:13px; color:#9ca3af; text-align:center;">
        Questions? Reply directly to this email or reach us at <strong>sasindragandla@gmail.com</strong>
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

// ── CRON: Every hour — run the follow-up automation ─
cron.schedule('0 * * * *', async () => {
  console.log('⏰ [CRON] Running Automation: Email & SMS Follow-up Check...');

  try {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const fourHoursAgo  = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const API_URL       = process.env.API_URL || 'https://click2website-backend.onrender.com';

    // Find users who: haven't opened the email, automation is NOT paused
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
          ? user.createdAt <= threeHoursAgo               // first reminder 3h after signup
          : (now - lastReminder) >= 3 * 60 * 60 * 1000;  // repeat every 3h

      if (canSendEmail && process.env.PLATFORM_EMAIL && process.env.PLATFORM_EMAIL_PASSWORD) {
        try {
          const newCount    = (user.reminderCount || 0) + 1;
          const trackingUrl = `${API_URL}/api/auth/track-welcome/${user._id}`;

          await transporter.sendMail({
            from: `"Click2Website Team" <${process.env.PLATFORM_EMAIL}>`,
            to:   user.email,
            subject: `⏰ Reminder #${newCount}: Your website is waiting, ${user.name.split(' ')[0]}!`,
            html:  buildFollowupEmailHtml(user, newCount, trackingUrl),
          });

          user.lastReminderAt = now;
          user.reminderCount  = newCount;
          await user.save();
          console.log(`✉️  Reminder email #${newCount} sent to ${user.email}`);
        } catch (err) {
          console.error(`❌ Follow-up email failed for ${user.email}:`, err.message);
        }
      }

      // ── SMS FOLLOW-UP (once, 4 hours after signup) ──
      if (!user.smsFollowupSent && user.phone && user.createdAt <= fourHoursAgo) {
        const client = getTwilioClient();
        if (client) {
          try {
            const smsBody =
              `Hi ${user.name.split(' ')[0]}! 👋 Welcome to Click2Website! ` +
              `Let's get started: https://click2website.netlify.app`;

            const formattedPhone = user.phone.startsWith('+') ? user.phone : '+' + user.phone;
            await client.messages.create({
              body: smsBody,
              from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
              to:   `whatsapp:${formattedPhone}`,
            });

            user.smsFollowupSent = true;
            await user.save();
            console.log(`📱 SMS follow-up sent to ${user.phone} (${user.email})`);
          } catch (err) {
            console.error(`❌ SMS failed for ${user.phone}:`, err.message);
          }
        }
      }

    }

    console.log(`✅ [CRON] Automation complete. Processed ${unengagedUsers.length} unengaged users.`);
  } catch (err) {
    console.error('❌ [CRON] Automation Error:', err.message);
  }
});

// ── Send Welcome Email immediately on signup ───────
export const sendWelcomeEmail = async (user) => {
  if (!process.env.PLATFORM_EMAIL || !process.env.PLATFORM_EMAIL_PASSWORD) return;
  const API_URL = process.env.API_URL || 'https://click2website-backend.onrender.com';
  const trackingUrl = `${API_URL}/api/auth/track-welcome/${user._id}`;
  try {
    await transporter.sendMail({
      from:    `"Click2Website Team" <${process.env.PLATFORM_EMAIL}>`,
      to:      user.email,
      subject: `🎉 Welcome to Click2Website! Let's build your dream website.`,
      html:    buildWelcomeEmailHtml(user, trackingUrl),
    });
    console.log(`✉️  Welcome email sent to ${user.email}`);
  } catch (err) {
    console.error('❌ Welcome email failed:', err.message);
  }
};

// ── Send Login Alert Email on login ───────
export const sendLoginAlertEmail = async (user) => {
  if (!process.env.PLATFORM_EMAIL || !process.env.PLATFORM_EMAIL_PASSWORD) return;
  try {
    await transporter.sendMail({
      from:    `"Click2Website Security" <${process.env.PLATFORM_EMAIL}>`,
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
            If this was you, you can safely ignore this email. If you did not authorize this login, please contact us immediately or reset your password.
          </p>
          <p style="font-size:12px;color:#9ca3af;margin-top:30px;border-top:1px solid #e5e7eb;padding-top:16px;">
            © ${new Date().getFullYear()} Click2Website Security
          </p>
        </div>
      `,
    });
    console.log(`✉️  Login alert email sent to ${user.email}`);
  } catch (err) {
    console.error('❌ Login alert email failed:', err.message);
  }
};

console.log('✅ Cron Jobs Initialized — Email & SMS automation active.');
