const express = require('express');
const { authRequired, wrapAction } = require('../middleware/auth');
const storeService = require('../services/storeService');
const orderService = require('../services/orderService');
const petService = require('../services/petService');
const dailyService = require('../services/dailyService');
const oss = require('../oss');

const storeRouter = express.Router();
storeRouter.post('/', authRequired, wrapAction((event, openid) => storeService.handle(event, openid)));

const orderRouter = express.Router();
orderRouter.post('/', authRequired, wrapAction((event, openid) => orderService.handle(event, openid)));

const petRouter = express.Router();
petRouter.post('/', authRequired, wrapAction((event, openid) => petService.handle(event, openid)));

const dailyRouter = express.Router();
dailyRouter.post('/', authRequired, wrapAction((event, openid) => dailyService.handle(event, openid)));

const uploadRouter = express.Router();
uploadRouter.post('/sign', authRequired, (req, res) => {
  try {
    const folder = (req.body && req.body.folder) || 'uploads';
    const ext = (req.body && req.body.ext) || 'jpg';
    const signed = oss.createPostPolicy(folder, ext);
    return res.json({
      success: true,
      upload: signed
    });
  } catch (err) {
    console.error('upload sign failed', err);
    return res.json({
      success: false,
      errMsg: (err && err.message) || '获取上传签名失败'
    });
  }
});

module.exports = {
  storeRouter,
  orderRouter,
  petRouter,
  dailyRouter,
  uploadRouter
};
