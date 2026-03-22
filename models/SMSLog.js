import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    to:      { type: String, required: true },
    body:    { type: String, required: true },
    type:    { type: String, enum: ['auto', 'custom'], default: 'auto' },
    sentBy:  { type: String, enum: ['system', 'admin'], default: 'system' },
    status:  { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error:   { type: String, default: null },
  },
  { timestamps: true }
);

const SMSLog = mongoose.model('SMSLog', smsLogSchema);
export default SMSLog;
