import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = 3000;

app.use(
  cors({
    origin: "http://localhost:3001",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);

// Mock data
const overviewData = {
  criticalAlerts: {
    count: 3,
    subtitle: "Requires immediate attention",
    affectedParameters: [
      { id: 1, name: "Temperature Control", checked: false },
      { id: 2, name: "Pressure System", checked: false },
      { id: 3, name: "CD's", checked: false },
    ],
  },
  warnings: {
    count: 3,
    subtitle: "Monitoring required",
    affectedParameters: [
      { id: 1, name: "Coolant Flow", checked: false },
      { id: 2, name: "Humidity Level", checked: false },
      { id: 3, name: "Material Feed", checked: false },
    ],
  },
};

const recommendationsData = [
  { id: 1, title: "Temperature Control Frequency", impact: "High Impact" },
  { id: 2, title: "Calibration Procedure", impact: "High Impact" },
  { id: 3, title: "Material Feed Rate", impact: "Medium Impact" },
  { id: 4, title: "Operator Training", impact: "Medium Impact" },
  { id: 5, title: "Humidity Control", impact: "Low Impact" },
];

// API Routes
app.get("/api/overview", (req, res) => {
  // Simulate network delay
  setTimeout(() => {
    res.json(overviewData);
  }, 300);
});

app.get("/api/recommendations", (req, res) => {
  setTimeout(() => {
    res.json(recommendationsData);
  }, 300);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
