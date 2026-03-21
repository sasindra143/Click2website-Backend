import cron from 'node-cron';
import nodemailer from 'nodemailer';
import User from './models/User.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PLATFORM_EMAIL,
    pass: process.env.PLATFORM_EMAIL_PASSWORD,
  },
});

// Run this job every hour
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running Cron Job: Checking for unopened welcome emails...');
  
  try {
    // 4 hours ago Timestamp
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    // Find users created > 4 hours ago, who have NOT opened the email, and haven't been reminded yet
    const unengagedUsers = await User.find({
      createdAt: { $lte: fourHoursAgo },
      welcomeEmailOpened: false,
      welcomeEmailReminderSent: false,
    });

    for (const user of unengagedUsers) {
      if (process.env.PLATFORM_EMAIL && process.env.PLATFORM_EMAIL_PASSWORD) {
        try {
          await transporter.sendMail({
            from: `"Click2Website Team" <${process.env.PLATFORM_EMAIL}>`,
            to: user.email,
            subject: 'We noticed you haven\'t started your project yet! 👋',
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2>Hi ${user.name.split(' ')[0]},</h2>
                <p>We sent you a Welcome Email a few hours ago but noticed you haven't opened it.</p>
                <p>Are you still interested in building your dream website? Our team is standing by ready to analyze your requirements and build something beautiful.</p>
                <br/><br/>
                <p>Reply to this email directly if you have any questions or need immediate assistance.</p>
                <p>Best regards,<br/>The Click2Website Team</p>
                <img src="${process.env.API_URL || 'http://localhost:5000'}/api/auth/track-welcome/${user._id}" width="1" height="1" alt="" />
              </div>
            `,
          });
          
          console.log(`Reminder email sent to ${user.email}`);

          // Mark as reminded so we don't spam them every hour
          user.welcomeEmailReminderSent = true;
          await user.save();
          
        } catch (emailErr) {
          console.error(`Failed to send reminder to ${user.email}:`, emailErr.message);
        }
      }
    }
  } catch (err) {
    console.error('Cron Job Error:', err.message);
  }
});

console.log('✅ Cron Jobs Initialized.');
