const express = require('express');
const { signAdminToken, adminRequired } = require('../middleware/auth');
const adminService = require('../services/adminService');
const storeService = require('../services/storeService');
const orderService = require('../services/orderService');
const notifyLogService = require('../services/notifyLogService');

const adminRouter = express.Router();

adminRouter.post('/login', (req, res) => {
  const username = (req.body && req.body.username) || '';
  const password = (req.body && req.body.password) || '';
  if (!username || !password) {
    return res.status(400).json({ success: false, errMsg: '请输入账号和密码' });
  }

  const result = adminService.verifyAdminLogin(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }

  const token = signAdminToken({
    role: 'admin',
    username: result.username
  });

  return res.json({
    success: true,
    token,
    username: result.username,
    displayName: result.displayName
  });
});

adminRouter.get('/me', adminRequired, (req, res) => {
  return res.json({
    success: true,
    username: req.admin.username
  });
});

adminRouter.get('/applications', adminRequired, async (req, res) => {
  try {
    const result = await storeService.listPendingMerchantApplications();
    return res.json(result);
  } catch (err) {
    console.error('admin list applications failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.post('/applications/review', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.reviewMerchantApplication({
      store_id: body.store_id,
      decision: body.decision,
      rejectReason: body.rejectReason
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] review', req.admin.username, body.store_id, body.decision);
    return res.json(result);
  } catch (err) {
    console.error('admin review failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '操作失败'
    });
  }
});

adminRouter.get('/stores', adminRequired, async (req, res) => {
  try {
    const result = await storeService.listAdminStores(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list stores failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/coop-contract', adminRequired, async (req, res) => {
  try {
    const result = await storeService.getAdminCoopContract({
      store_id: (req.query && req.query.store_id) || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin get coop contract failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/orders', adminRequired, async (req, res) => {
  try {
    const result = await orderService.listAdminStoreOrders(req.query || {});
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin list store orders failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.post('/stores/access', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.updateAdminStoreAccess({
      store_id: body.store_id,
      action: body.action,
      reason: body.reason
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] store access', req.admin.username, body.store_id, body.action);
    return res.json(result);
  } catch (err) {
    console.error('admin store access failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '操作失败'
    });
  }
});

adminRouter.post('/stores/bind-oa', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.bindAdminStoreOa({
      store_id: body.store_id,
      oa_openid: body.oa_openid || body.oaOpenid || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log(
      '[admin] store bind oa',
      req.admin.username,
      body.store_id,
      result.ownerOaBound ? 'bound' : 'cleared'
    );
    return res.json(result);
  } catch (err) {
    console.error('admin store bind oa failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '操作失败'
    });
  }
});

adminRouter.get('/stores/push-status', adminRequired, async (req, res) => {
  try {
    const result = await notifyLogService.listAdminStorePushStatus(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list store push status failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/push-logs', adminRequired, async (req, res) => {
  try {
    const result = await notifyLogService.listAdminPushLogs(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list store push logs failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

module.exports = adminRouter;
