const axios = require('axios');
const config = require('./config');

const tokenCache = {
  user: { value: '', expireAt: 0 },
  merchant: { value: '', expireAt: 0 }
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

async function getAccessToken(client = 'user') {
  const { client: appClient, appId, secret } = getAppCredentials(client);
  const cached = tokenCache[appClient] || { value: '', expireAt: 0 };
  if (cached.value && cached.expireAt > Date.now()) {
    return cached.value;
  }
  if (!appId || !secret) {
    throw new Error(`未配置 ${appClient === 'merchant' ? 'WX_MERCHANT_APPID/WX_MERCHANT_SECRET' : 'WX_APPID/WX_SECRET'}`);
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
  tokenCache[appClient] = {
    value: data.access_token,
    expireAt: Date.now() + Math.max((data.expires_in || 7200) - 120, 60) * 1000
  };
  return tokenCache[appClient].value;
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

module.exports = {
  normalizeClient,
  getAppCredentials,
  code2Session,
  getAccessToken,
  getPhoneNumber,
  getUnlimitedQrCode
};
