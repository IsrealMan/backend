import express from "express";
import { z } from "zod";

const router = express.Router();

const demoRequestSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email address"),
  company: z.string().min(1, "Company is required").max(200),
  phone: z.string().max(50).optional().default(""),
  message: z.string().max(2000).optional().default(""),
});

router.post("/", async (req, res) => {
  const result = demoRequestSchema.safeParse(req.body);
  if (!result.success) {
    const firstError = result.error.errors[0]?.message || "Validation failed";
    return res.status(400).json({ error: firstError });
  }

  const { name, email, company, phone, message } = result.data;

  // Log the demo request (replace with email/webhook in production)
  console.log("--- New Demo Request ---");
  console.log(`Name: ${name}`);
  console.log(`Email: ${email}`);
  console.log(`Company: ${company}`);
  console.log(`Phone: ${phone}`);
  console.log(`Message: ${message}`);
  console.log("------------------------");

  // TODO: integrate email service or webhook here
  // e.g. await sendEmail({ to: 'senaitd@predixaai.com', subject: `Demo request from ${name}`, body: ... })

  res.json({ success: true, message: "Demo request received" });
});

export default router;
