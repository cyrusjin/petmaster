const crypto = require('crypto');
const config = require('./config');

function getOssClient() {
  if (!config.oss.accessKeyId || !config.oss.bucket) {
    throw new Error('OSS 未配置');
  }
  // 延迟加载，避免部分环境下模块初始化读网卡失败
  const OSS = require('ali-oss');
  return new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket
  });
}

function buildPublicUrl(objectKey) {
  if (config.oss.publicBaseUrl) {
    return `${config.oss.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`;
  }
  return `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com/${objectKey}`;
}

function isOssUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('cloud://')) return false;
  if (url.startsWith('https://') || url.startsWith('http://')) return true;
  return false;
}

function isStoredMedia(url) {
  return typeof url === 'string' && (
    url.startsWith('cloud://')
    || url.startsWith('https://')
    || url.startsWith('http://')
  );
}

function extractObjectKey(url) {
  if (!url || typeof url !== 'string') return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch (err) {
    return '';
  }
}

async function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('cloud://')) return '';
  if (!isOssUrl(url)) return url;
  if (config.oss.publicRead) return url;

  const key = extractObjectKey(url);
  if (!key) return url;
  try {
    const client = getOssClient();
    return client.signatureUrl(key, { expires: config.oss.signedUrlExpires });
  } catch (err) {
    console.error('resolveMediaUrl failed', err);
    return url;
  }
}

async function resolveMediaUrls(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const resolved = [];
  for (const url of list) {
    resolved.push(await resolveMediaUrl(url));
  }
  return resolved.filter(Boolean);
}

function createPostPolicy(folder = 'uploads', ext = 'jpg') {
  const safeFolder = String(folder || 'uploads').replace(/^\/+|\/+$/g, '');
  const safeExt = String(ext || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const objectKey = `${safeFolder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${safeExt}`;
  const expireAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const policyObj = {
    expiration: expireAt,
    conditions: [
      ['content-length-range', 0, 50 * 1024 * 1024],
      ['eq', '$key', objectKey],
      ['eq', '$bucket', config.oss.bucket]
    ]
  };
  const policy = Buffer.from(JSON.stringify(policyObj)).toString('base64');
  const signature = crypto
    .createHmac('sha1', config.oss.accessKeySecret)
    .update(policy)
    .digest('base64');

  const host = `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
  const publicUrl = buildPublicUrl(objectKey);

  return {
    host,
    key: objectKey,
    policy,
    OSSAccessKeyId: config.oss.accessKeyId,
    signature,
    success_action_status: '200',
    publicUrl,
    expireAt
  };
}

async function uploadBuffer(objectKey, buffer, contentType = 'application/octet-stream') {
  const client = getOssClient();
  await client.put(objectKey, buffer, {
    headers: { 'Content-Type': contentType }
  });
  return buildPublicUrl(objectKey);
}

module.exports = {
  getOssClient,
  buildPublicUrl,
  isOssUrl,
  isStoredMedia,
  extractObjectKey,
  resolveMediaUrl,
  resolveMediaUrls,
  createPostPolicy,
  uploadBuffer
};
