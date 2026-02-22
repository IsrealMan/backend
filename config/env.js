export const config = {
  PORT: process.env.PORT || 3000,
  MONGO_URI:
    process.env.MONGO_URI ||
    "mongodb+srv://predixia_user:cql15kpH3LE8jxVb@cluster0.etehlhp.mongodb.net/predixa?retryWrites=true&w=majority",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://israerl:Tzi3636@@127.0.0.1:5432/PredAI_QA", // PostgreSQL — PredAI_QA schema
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET || "access-secret-change-in-prod",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "refresh-secret-change-in-prod",
  ACCESS_TOKEN_EXPIRES: "10m",
  REFRESH_TOKEN_EXPIRES: "14d",
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "localhost",
  NODE_ENV: process.env.NODE_ENV || "development",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:3001",
};
