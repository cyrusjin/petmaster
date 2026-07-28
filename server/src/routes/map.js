const express = require('express');
const { authRequired } = require('../middleware/auth');
const mapService = require('../services/mapService');

const router = express.Router();

router.get('/driving-distance', authRequired, async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query || {};
    const result = await mapService.getDrivingDistanceKm(fromLat, fromLng, toLat, toLng);
    return res.json({
      success: true,
      distanceKm: result.distanceKm,
      distanceMeters: result.distanceMeters,
      mode: 'driving',
      cached: result.cached
    });
  } catch (err) {
    const code = err && err.code;
    const status = code === 'INVALID_COORDS' || code === 'MAP_KEY_MISSING' ? 400 : 502;
    console.error('[map] driving-distance failed', err.message || err);
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '获取导航距离失败',
      code: code || 'MAP_ERROR'
    });
  }
});

router.post('/driving-distance', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await mapService.getDrivingDistanceKm(
      body.fromLat,
      body.fromLng,
      body.toLat,
      body.toLng
    );
    return res.json({
      success: true,
      distanceKm: result.distanceKm,
      distanceMeters: result.distanceMeters,
      mode: 'driving',
      cached: result.cached
    });
  } catch (err) {
    const code = err && err.code;
    const status = code === 'INVALID_COORDS' || code === 'MAP_KEY_MISSING' ? 400 : 502;
    console.error('[map] driving-distance failed', err.message || err);
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '获取导航距离失败',
      code: code || 'MAP_ERROR'
    });
  }
});

module.exports = router;
