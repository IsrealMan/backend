import mongoose from "mongoose";

const qualityParameterSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  category:    { type: String, required: true },
  unit:        { type: String, default: "" },
  lsl:         { type: Number, default: null },
  usl:         { type: Number, default: null },
  lcl:         { type: Number, default: null },
  ucl:         { type: Number, default: null },
  target:      { type: Number, default: null },
  status:      { type: String, enum: ["In Control", "Warning", "Out of Control"], default: "In Control" },
  lastUpdated: { type: Date, default: Date.now },
  active:      { type: Boolean, default: true },
});

export default mongoose.model("QualityParameter", qualityParameterSchema);
