import mongoose from 'mongoose';

const localizationKeySchema = new mongoose.Schema(
  {
    page:     { type: String, required: true, trim: true, lowercase: true, default: 'landing' },
    key:      { type: String, required: true, trim: true },
    section:  { type: String, required: true, trim: true, lowercase: true },
    language: { type: String, required: true, trim: true, lowercase: true },
    value:    { type: String, required: true },
    status:   { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// Unique per page + key + section + language
localizationKeySchema.index({ page: 1, key: 1, section: 1, language: 1 }, { unique: true });
localizationKeySchema.index({ page: 1, language: 1, section: 1 });

export default mongoose.model('LandingKey', localizationKeySchema);
