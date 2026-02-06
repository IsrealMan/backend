export const config = {
  PORT: process.env.PORT || 3001,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/predixa',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'access-secret-change-in-prod',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-in-prod',
  ACCESS_TOKEN_EXPIRES: '10m',
  REFRESH_TOKEN_EXPIRES: '14d',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || 'localhost',
  NODE_ENV: process.env.NODE_ENV || 'development'
};
