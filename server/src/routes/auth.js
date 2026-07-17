const express = require('express');
const { signToken, authRequired, wrapAction } = require('../middleware/auth');
const wechat = require('../wechat');
const userService = require('../services/userService');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const code = (req.body && req.body.code) || '';
    if (!code) {
      return res.status(400).json({ success: false, errMsg: '缺少 code' });
    }
    const session = await wechat.code2Session(code);
    if (!session.openid) {
      return res.status(400).json({ success: false, errMsg: '无法获取 openid' });
    }
    await userService.getOrCreateUser(session.openid);
    const token = signToken({ openid: session.openid });
    return res.json({
      success: true,
      token,
      openid: session.openid
    });
  } catch (err) {
    console.error('login failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '登录失败'
    });
  }
});

router.post('/', authRequired, wrapAction((event, openid) => userService.handle(event, openid)));

module.exports = router;
