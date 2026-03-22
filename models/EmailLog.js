import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    to:         { type: String, required: true },
    subject:    { type: String, required: true },
    type:       { type: String, enum: ['welcome', 'reminder', 'login-alert', 'custom'], default: 'welcome' },
    status:     { type: String, enum: ['sent', 'failed'], default: 'sent' },
    retryCount: { type: Number, default: 0 },
    error:      { type: String, default: null },
  },
  { timestamps: true }
);

const EmailLog = mongoose.model('EmailLog', emailLogSchema);
export default EmailLog;
