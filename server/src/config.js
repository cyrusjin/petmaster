const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

const config = {
  port: Number(required('PORT', '3000')),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/petmaster'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '30d'),
  wxAppId: required('WX_APPID'),
  wxSecret: required('WX_SECRET'),
  oss: {
    region: required('OSS_REGION', 'oss-cn-hangzhou'),
    bucket: required('OSS_BUCKET'),
    accessKeyId: required('OSS_ACCESS_KEY_ID'),
    accessKeySecret: required('OSS_ACCESS_KEY_SECRET'),
    publicBaseUrl: required('OSS_PUBLIC_BASE_URL', ''),
    publicRead: String(required('OSS_PUBLIC_READ', 'true')).toLowerCase() === 'true',
    signedUrlExpires: Number(required('OSS_SIGNED_URL_EXPIRES', '3600'))
  },
  devMockWechat: String(required('DEV_MOCK_WECHAT', 'false')).toLowerCase() === 'true'
};

module.exports = config;
