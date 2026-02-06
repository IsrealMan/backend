import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'operator'], default: 'user' },
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  refreshTokens: [{ token: String, expiresAt: Date }],
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  return obj;
};

export default mongoose.model('User', userSchema);
