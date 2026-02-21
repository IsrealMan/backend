import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true },
  title:     { type: String, required: true },
  message:   { type: String, required: true },
  type:      { type: String, enum: ['critical', 'warning', 'info', 'system'], default: 'info' },
  read:      { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, read: 1 });

export default mongoose.model('Notification', notificationSchema);
