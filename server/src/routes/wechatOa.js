const express = require('express');
const config = require('../config');
const wechat = require('../wechat');
const oaBindService = require('../services/oaBindService');

const router = express.Router();

function getOaToken() {
  return (config.wxOa && config.wxOa.token) || '';
}

function getOaAesKey() {
  return (config.wxOa && config.wxOa.aesKey) || '';
}

function getOaAppId() {
  return (config.wxOa && config.wxOa.appId) || '';
}

/** 微信服务器 URL 验证 */
router.get('/', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = getOaToken();
  if (!token) {
    return res.status(500).send('WX_OA_TOKEN not configured');
  }
  if (!wechat.verifyOaSignature(token, timestamp, nonce, signature)) {
    return res.status(403).send('invalid signature');
  }
  return res.send(echostr || '');
});

/** 关注/取关等事件回调（XML） */
router.post('/', async (req, res) => {
  const token = getOaToken();
  const { signature, timestamp, nonce, msg_signature: msgSignature, encrypt_type: encryptType } = req.query || {};

  if (!token) {
    return res.status(500).send('WX_OA_TOKEN not configured');
  }

  let rawXml = '';
  if (typeof req.body === 'string') {
    rawXml = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawXml = req.body.toString('utf8');
  } else if (req.body && typeof req.body === 'object') {
    // 兜底：若被误解析
    rawXml = req.rawBody || '';
  }

  try {
    let xml = rawXml;
    const outer = wechat.parseOaXmlMessage(rawXml);
    const isEncrypt = String(encryptType || '').toLowerCase() === 'aes' || !!outer.Encrypt;

    if (isEncrypt) {
      const encrypt = outer.Encrypt;
      if (!wechat.verifyOaMsgSignature(token, timestamp, nonce, encrypt, msgSignature)) {
        return res.status(403).send('invalid msg_signature');
      }
      xml = wechat.decryptOaMessage(encrypt, getOaAesKey(), getOaAppId());
    } else if (!wechat.verifyOaSignature(token, timestamp, nonce, signature)) {
      return res.status(403).send('invalid signature');
    }

    const msg = wechat.parseOaXmlMessage(xml);
    const event = String(msg.Event || '').toLowerCase();
    const oaOpenid = msg.FromUserName || '';

    if (msg.MsgType === 'event' && event === 'subscribe') {
      await oaBindService.handleOaSubscribe(oaOpenid);
    } else if (msg.MsgType === 'event' && event === 'unsubscribe') {
      await oaBindService.handleOaUnsubscribe(oaOpenid);
    }
  } catch (err) {
    console.error('[oa] callback error', err.message || err);
  }

  // 微信要求尽快返回 success
  return res.send('success');
});

module.exports = router;
