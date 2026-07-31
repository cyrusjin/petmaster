const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { authRequired, wrapAction } = require('../middleware/auth');
const storeService = require('../services/storeService');
const orderService = require('../services/orderService');
const petService = require('../services/petService');
const dailyService = require('../services/dailyService');
const mediaCheckService = require('../services/mediaCheckService');
const oss = require('../oss');
const config = require('../config');

const storeRouter = express.Router();
storeRouter.post('/', authRequired, wrapAction((event, openid) => storeService.handle(event, openid)));

const orderRouter = express.Router();
orderRouter.post('/', authRequired, wrapAction((event, openid) => orderService.handle(event, openid)));

const petRouter = express.Router();
petRouter.post('/', authRequired, wrapAction((event, openid) => petService.handle(event, openid)));

const dailyRouter = express.Router();
dailyRouter.post('/', authRequired, wrapAction((event, openid) => dailyService.handle(event, openid)));

const uploadDir = path.join(config.media.root, '_tmp');

function ensureUploadTmpDir() {
  fs.mkdirSync(uploadDir, { recursive: true });
}

ensureUploadTmpDir();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        ensureUploadTmpDir();
        cb(null, uploadDir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

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

uploadRouter.post('/', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, errMsg: '未收到文件' });
    }
    const key = (req.body && req.body.key) || '';
    if (!key) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ success: false, errMsg: '缺少文件 key' });
    }
    const publicUrl = oss.saveUploadedFile(key, req.file.path);
    // 视频上传后同步抽帧，避免客户端无 thumb 时用户端看不到预览图
    if (oss.isVideoMedia(publicUrl)) {
      try {
        await oss.ensureVideoCoverUrl(publicUrl);
      } catch (err) {
        console.warn('[upload] generate video cover failed', publicUrl, err.message || err);
      }
    }
    // 微信内容安全：同步拦违规图；异步结果再删文件
    await mediaCheckService.moderateUploadedMedia({
      publicUrl,
      req,
      folder: String(key).split('/')[0] || ''
    });
    return res.status(200).json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('upload failed', err);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    const status = err && err.code === 'MEDIA_RISKY' ? 400 : 500;
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '上传失败'
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
