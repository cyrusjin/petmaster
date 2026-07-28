#!/usr/bin/env node
/**
 * 宠主端 API 冒烟测试（在服务器上运行，使用 JWT 模拟登录）
 * node scripts/test-user-api.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const axios = require('axios');

const BASE = process.env.API_TEST_BASE || 'http://127.0.0.1:3000';
const OPENID = process.env.API_TEST_OPENID || 'test_user_api_openid';
const CLIENT = 'user';

function authHeaders() {
  const token = jwt.sign(
    { openid: OPENID, client: CLIENT, appOpenid: OPENID, unionid: '' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function post(pathname, body) {
  const url = `${BASE.replace(/\/$/, '')}${pathname}`;
  const { status, data } = await axios.post(url, body, {
    headers: authHeaders(),
    validateStatus: () => true,
    timeout: 15000
  });
  return { path: pathname, status, data };
}

async function main() {
  const tests = [
    ['GET /health', async () => {
      const { status, data } = await axios.get(`${BASE}/health`, { validateStatus: () => true });
      return { path: '/health', status, data };
    }],
    ['POST /api/user initDatabase', () => post('/api/user', { action: 'initDatabase' })],
    ['POST /api/user getUserInfo', () => post('/api/user', { action: 'getUserInfo' })],
    ['POST /api/user ping', () => post('/api/user', { action: 'ping' })],
    ['POST /api/pet listPets', () => post('/api/pet', { action: 'listPets' })],
    ['POST /api/order listUserOrders', () => post('/api/order', { action: 'listUserOrders' })],
    ['POST /api/daily initDatabase', () => post('/api/daily', { action: 'initDatabase' })],
    ['POST /api/upload/sign', () => post('/api/upload/sign', { folder: 'test', ext: 'jpg' })],
    ['POST /api/store getStore missing', () => post('/api/store', { action: 'getStore', store_id: '__missing__' })]
  ];

  console.log(`Testing ${BASE} as openid=${OPENID}\n`);
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    try {
      const result = await fn();
      const ok = result.status >= 200 && result.status < 500;
      const body = result.data || {};
      const success = body.success !== false || result.path === '/health';
      if (ok && (success || result.path.includes('getStore'))) {
        passed += 1;
        console.log(`✓ ${name} → HTTP ${result.status}`, body.success === false ? `(expected: ${body.errMsg || 'fail'})` : '');
      } else {
        failed += 1;
        console.log(`✗ ${name} → HTTP ${result.status}`, JSON.stringify(body).slice(0, 200));
      }
    } catch (err) {
      failed += 1;
      console.log(`✗ ${name} → ${err.message}`);
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
