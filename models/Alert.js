import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
  name: { type: String, required: true },
  severity: { type: String, enum: ["critical", "warning"], required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Alert", alertSchema);
