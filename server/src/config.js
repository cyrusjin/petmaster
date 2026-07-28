const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function hashAdminPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function parseAdminAccounts(raw, salt) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text.split(',').map((entry) => {
    const parts = entry.trim().split(':');
    const username = (parts[0] || '').trim();
    const password = parts.slice(1).join(':');
    if (!username || !password) return null;
    return {
      username,
      displayName: username,
      passwordHash: hashAdminPassword(password, salt)
    };
  }).filter(Boolean);
}

const userAppId = required('WX_APPID') || required('WX_USER_APPID');
const userSecret = required('WX_SECRET') || required('WX_USER_SECRET');
const merchantAppId = required('WX_MERCHANT_APPID', '');
const merchantSecret = required('WX_MERCHANT_SECRET', '');

const config = {
  port: Number(required('PORT', '3000')),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/petmaster'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '30d'),
  // 兼容旧变量：WX_APPID/WX_SECRET = 宠主端
  wxAppId: userAppId,
  wxSecret: userSecret,
  wxApps: {
    user: {
      appId: userAppId,
      secret: userSecret
    },
    merchant: {
      appId: merchantAppId || userAppId,
      secret: merchantSecret || userSecret
    }
  },
  // 媒体文件存轻量服务器本地磁盘（不再依赖 OSS）
  media: {
    root: required('MEDIA_ROOT', path.join(__dirname, '..', 'data', 'media')),
    apiPublicBaseUrl: required('API_PUBLIC_BASE_URL', 'https://api.petmaster.me'),
    publicBaseUrl: required('MEDIA_PUBLIC_BASE_URL', 'https://api.petmaster.me/media')
  },
  // 保留空 oss 字段，避免旧引用报错
  oss: {
    region: required('OSS_REGION', 'oss-cn-hangzhou'),
    bucket: required('OSS_BUCKET', ''),
    accessKeyId: required('OSS_ACCESS_KEY_ID', ''),
    accessKeySecret: required('OSS_ACCESS_KEY_SECRET', ''),
    publicBaseUrl: required('OSS_PUBLIC_BASE_URL', ''),
    publicRead: true,
    signedUrlExpires: 3600
  },
  devMockWechat: String(required('DEV_MOCK_WECHAT', 'false')).toLowerCase() === 'true',
  adminPasswordSalt: required('ADMIN_PASSWORD_SALT', required('JWT_SECRET', 'dev-secret-change-me')),
  adminJwtExpiresIn: required('ADMIN_JWT_EXPIRES_IN', '8h'),
  adminAccounts: parseAdminAccounts(
    required('ADMIN_ACCOUNTS', 'jinsen:PetMaster@2026,reviewer:Review@2026'),
    required('ADMIN_PASSWORD_SALT', required('JWT_SECRET', 'dev-secret-change-me'))
  )
};

module.exports = config;
