const axios = require('axios');
const config = require('./config');

let cachedToken = { value: '', expireAt: 0 };

async function code2Session(code) {
  if (config.devMockWechat) {
    // 开发联调固定 openid，避免每次 wx.login 都变成新用户
    return {
      openid: 'dev_openid_petmaster',
      session_key: 'mock_session_key'
    };
  }
  if (!config.wxAppId || !config.wxSecret) {
    throw new Error('未配置 WX_APPID / WX_SECRET');
  }
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const { data } = await axios.get(url, {
    params: {
      appid: config.wxAppId,
      secret: config.wxSecret,
      js_code: code,
      grant_type: 'authorization_code'
    },
    timeout: 10000
  });
  if (!data || data.errcode) {
    throw new Error((data && (data.errmsg || String(data.errcode))) || 'code2session 失败');
  }
  return data;
}

async function getAccessToken() {
  if (cachedToken.value && cachedToken.expireAt > Date.now()) {
    return cachedToken.value;
  }
  if (!config.wxAppId || !config.wxSecret) {
    throw new Error('未配置 WX_APPID / WX_SECRET');
  }
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid: config.wxAppId,
      secret: config.wxSecret
    },
    timeout: 10000
  });
  if (!data || !data.access_token) {
    throw new Error((data && data.errmsg) || '获取 access_token 失败');
  }
  cachedToken = {
    value: data.access_token,
    expireAt: Date.now() + Math.max((data.expires_in || 7200) - 120, 60) * 1000
  };
  return cachedToken.value;
}

async function getPhoneNumber(code) {
  const accessToken = await getAccessToken();
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

async function getUnlimitedQrCode({ scene, page, envVersion = 'trial', width = 430 }) {
  const accessToken = await getAccessToken();
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
  code2Session,
  getAccessToken,
  getPhoneNumber,
  getUnlimitedQrCode
};
