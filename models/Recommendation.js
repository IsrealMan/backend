import mongoose from "mongoose";

const recommendationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  impact: {
    type: String,
    enum: ["High Impact", "Medium Impact", "Low Impact"],
    required: true,
  },
  relatedParameters: [{ type: String }],
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Recommendation", recommendationSchema);
