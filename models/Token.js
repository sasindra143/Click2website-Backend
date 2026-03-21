import mongoose from 'mongoose';

/**
 * Token schema – stores JWT blacklist / refresh tokens for security
 */
const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['refresh', 'blacklist'],
      default: 'refresh',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-delete expired tokens via TTL index
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Token = mongoose.model('Token', tokenSchema);
export default Token;
