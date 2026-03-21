import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * User schema – stores auth info + connected Gmail tokens
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    // Gmail OAuth tokens
    gmail_email: { type: String, default: null },
    access_token: { type: String, default: null },
    refresh_token: { type: String, default: null },
    token_expiry: { type: Date, default: null },
    gmail_connected: { type: Boolean, default: false },

    // Tracking
    emailsSent: { type: Number, default: 0 },
    smsSent: { type: Number, default: 0 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    lastLogin: { type: Date, default: null },
    avatar: { type: String, default: '' },
    welcomeEmailOpened: { type: Boolean, default: false },
    welcomeEmailReminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
