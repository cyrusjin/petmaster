const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildRandomDisplayNo(length = 10) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function deriveDisplayNo(seed, length = 10) {
  const str = String(seed || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  let state = hash >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += CODE_CHARS[state % CODE_CHARS.length];
  }
  return out;
}

function resolveOrderDisplayNo(order) {
  if (!order) return '';
  if (order.displayNo) return String(order.displayNo).trim();
  const seed = order.order_id || order.id || '';
  return seed ? deriveDisplayNo(`order:${seed}`) : '';
}

function resolveStoreDisplayNo(store) {
  if (!store) return '';
  if (store.displayNo) return String(store.displayNo).trim();
  const seed = store.store_id || '';
  return seed ? deriveDisplayNo(`store:${seed}`) : '';
}

function attachOrderDisplayNo(order) {
  if (!order || typeof order !== 'object') return order;
  const displayNo = resolveOrderDisplayNo(order);
  if (order.displayNo === displayNo) return order;
  return { ...order, displayNo };
}

function attachStoreDisplayNo(store) {
  if (!store || typeof store !== 'object') return store;
  const displayNo = resolveStoreDisplayNo(store);
  if (store.displayNo === displayNo) return store;
  return { ...store, displayNo };
}

module.exports = {
  CODE_CHARS,
  buildRandomDisplayNo,
  deriveDisplayNo,
  resolveOrderDisplayNo,
  resolveStoreDisplayNo,
  attachOrderDisplayNo,
  attachStoreDisplayNo
};
