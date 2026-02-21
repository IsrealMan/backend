import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  department: { type: String, default: '' },
  notifications: {
    email:         { type: Boolean, default: true  },
    push:          { type: Boolean, default: false },
    criticalAlerts:{ type: Boolean, default: true  },
    warnings:      { type: Boolean, default: true  },
    systemUpdates: { type: Boolean, default: false },
    maintenance:   { type: Boolean, default: true  },
  },
  system: {
    areasOfInterest: { type: [String], default: [] },
    customTags:      { type: String,   default: '' },
  },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'operator'], default: 'user' },
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  refreshTokens: [{ token: String, expiresAt: Date }],
  settings: { type: settingsSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  return obj;
};

export default mongoose.model('User', userSchema);
