const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');

const tokenCache = {
  user: { value: '', expireAt: 0 },
  merchant: { value: '', expireAt: 0 },
  oa: { value: '', expireAt: 0 }
};

function normalizeClient(client) {
  return client === 'merchant' ? 'merchant' : 'user';
}

function getAppCredentials(client = 'user') {
  const key = normalizeClient(client);
  const app = (config.wxApps && config.wxApps[key]) || {};
  const appId = app.appId || config.wxAppId;
  const secret = app.secret || config.wxSecret;
  return { client: key, appId, secret };
}

function getOaCredentials() {
  const oa = config.wxOa || {};
  return {
    appId: oa.appId || '',
    secret: oa.secret || '',
    token: oa.token || '',
    aesKey: oa.aesKey || ''
  };
}

async function code2Session(code, client = 'user') {
  const { client: appClient, appId, secret } = getAppCredentials(client);
  if (config.devMockWechat) {
    return {
      openid: appClient === 'merchant' ? 'dev_openid_merchant' : 'dev_openid_petmaster',
      unionid: 'dev_unionid_petmaster',
      session_key: 'mock_session_key',
      client: appClient
    };
  }
  if (!appId || !secret) {
    throw new Error(`未配置 ${appClient === 'merchant' ? 'WX_MERCHANT_APPID/WX_MERCHANT_SECRET' : 'WX_APPID/WX_SECRET'}`);
  }
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const { data } = await axios.get(url, {
    params: {
      appid: appId,
      secret,
      js_code: code,
      grant_type: 'authorization_code'
    },
    timeout: 10000
  });
  if (!data || data.errcode) {
    throw new Error((data && (data.errmsg || String(data.errcode))) || 'code2session 失败');
  }
  return {
    openid: data.openid,
    unionid: data.unionid || '',
    session_key: data.session_key || '',
    client: appClient
  };
}

async function fetchAccessToken(appId, secret, cacheKey) {
  const cached = tokenCache[cacheKey] || { value: '', expireAt: 0 };
  if (cached.value && cached.expireAt > Date.now()) {
    return cached.value;
  }
  if (!appId || !secret) {
    throw new Error(`未配置 ${cacheKey === 'oa' ? 'WX_OA_APPID/WX_OA_SECRET' : '微信 AppID/Secret'}`);
  }
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid: appId,
      secret
    },
    timeout: 10000
  });
  if (!data || !data.access_token) {
    throw new Error((data && data.errmsg) || '获取 access_token 失败');
  }
  tokenCache[cacheKey] = {
    value: data.access_token,
    expireAt: Date.now() + Math.max((data.expires_in || 7200) - 120, 60) * 1000
  };
  return tokenCache[cacheKey].value;
}

async function getAccessToken(client = 'user') {
  const { client: appClient, appId, secret } = getAppCredentials(client);
  return fetchAccessToken(appId, secret, appClient);
}

async function getOaAccessToken() {
  const { appId, secret } = getOaCredentials();
  return fetchAccessToken(appId, secret, 'oa');
}

async function getPhoneNumber(code, client = 'user') {
  const accessToken = await getAccessToken(client);
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
    { code },
    { timeout: 10000 }
  );
  if (!data || data.errcode) {
    throw new Error((data && data.errmsg) || '获取手机号失败');
  }
  return (data.phone_info && data.phone_info.phoneNumber) || '';
}

async function getUnlimitedQrCode({
  scene,
  page,
  envVersion = 'trial',
  width = 430,
  client = 'user'
}) {
  const accessToken = await getAccessToken(client);
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      scene,
      page,
      check_path: false,
      env_version: envVersion,
      width
    },
    { responseType: 'arraybuffer', timeout: 20000 }
  );

  const buffer = Buffer.from(data);
  const asText = buffer.slice(0, 100).toString('utf8');
  if (asText.includes('errcode')) {
    try {
      const err = JSON.parse(buffer.toString('utf8'));
      throw new Error(err.errmsg || '生成小程序码失败');
    } catch (parseErr) {
      if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
      throw new Error('生成小程序码失败');
    }
  }
  return buffer;
}

function buildTemplateData(fields) {
  const data = {};
  Object.keys(fields || {}).forEach((key) => {
    const value = fields[key];
    if (value == null) return;
    data[key] = { value: String(value) };
  });
  return data;
}

async function sendTemplateMessage({
  touser,
  templateId,
  data,
  miniprogram,
  url = ''
}) {
  if (!touser || !templateId) {
    throw new Error('缺少 touser 或 templateId');
  }
  const accessToken = await getOaAccessToken();
  const payload = {
    touser,
    template_id: templateId,
    data: buildTemplateData(data),
    url: url || ''
  };
  if (miniprogram && miniprogram.appid && miniprogram.pagepath) {
    payload.miniprogram = {
      appid: miniprogram.appid,
      pagepath: miniprogram.pagepath
    };
  }
  const { data: result } = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
    payload,
    { timeout: 10000 }
  );
  if (!result || result.errcode) {
    throw new Error((result && result.errmsg) || '发送模板消息失败');
  }
  return result;
}

async function getOaUserInfo(oaOpenid) {
  if (!oaOpenid) throw new Error('缺少公众号 openid');
  const accessToken = await getOaAccessToken();
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/user/info', {
    params: {
      access_token: accessToken,
      openid: oaOpenid,
      lang: 'zh_CN'
    },
    timeout: 10000
  });
  if (!data || data.errcode) {
    throw new Error((data && data.errmsg) || '获取公众号用户信息失败');
  }
  return {
    openid: data.openid || oaOpenid,
    unionid: data.unionid || '',
    subscribe: data.subscribe === 1,
    nickname: data.nickname || '',
    subscribeTime: data.subscribe_time || 0
  };
}

function verifyOaSignature(token, timestamp, nonce, signature) {
  if (!token || !timestamp || !nonce || !signature) return false;
  const sorted = [String(token), String(timestamp), String(nonce)].sort().join('');
  const hash = crypto.createHash('sha1').update(sorted).digest('hex');
  return hash === String(signature);
}

function parseXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = String(xml || '').match(re);
  if (!match) return '';
  return (match[1] != null && match[1] !== '' ? match[1] : match[2] || '').trim();
}

function parseOaXmlMessage(xml) {
  return {
    ToUserName: parseXmlTag(xml, 'ToUserName'),
    FromUserName: parseXmlTag(xml, 'FromUserName'),
    CreateTime: parseXmlTag(xml, 'CreateTime'),
    MsgType: parseXmlTag(xml, 'MsgType'),
    Event: parseXmlTag(xml, 'Event'),
    EventKey: parseXmlTag(xml, 'EventKey'),
    Content: parseXmlTag(xml, 'Content'),
    MsgId: parseXmlTag(xml, 'MsgId'),
    Encrypt: parseXmlTag(xml, 'Encrypt')
  };
}

function pkcs7Decode(buf) {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.slice(0, buf.length - pad);
}

function decryptOaMessage(encrypt, encodingAesKey, appId) {
  if (!encrypt || !encodingAesKey) {
    throw new Error('缺少加密消息或 AES Key');
  }
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (aesKey.length !== 32) {
    throw new Error('WX_OA_AES_KEY 无效');
  }
  const iv = aesKey.slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypt, 'base64')),
    decipher.final()
  ]);
  const content = pkcs7Decode(decrypted);
  const msgLen = content.readUInt32BE(16);
  const xml = content.slice(20, 20 + msgLen).toString('utf8');
  const fromAppId = content.slice(20 + msgLen).toString('utf8');
  if (appId && fromAppId && fromAppId !== appId) {
    throw new Error('解密消息 AppID 不匹配');
  }
  return xml;
}

function verifyOaMsgSignature(token, timestamp, nonce, encrypt, msgSignature) {
  if (!token || !timestamp || !nonce || !encrypt || !msgSignature) return false;
  const sorted = [String(token), String(timestamp), String(nonce), String(encrypt)].sort().join('');
  const hash = crypto.createHash('sha1').update(sorted).digest('hex');
  return hash === String(msgSignature);
}

module.exports = {
  normalizeClient,
  getAppCredentials,
  getOaCredentials,
  code2Session,
  getAccessToken,
  getOaAccessToken,
  getPhoneNumber,
  getUnlimitedQrCode,
  sendTemplateMessage,
  getOaUserInfo,
  verifyOaSignature,
  verifyOaMsgSignature,
  parseOaXmlMessage,
  decryptOaMessage
};
