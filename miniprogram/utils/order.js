const { callApiService, rejectOnFailure } = require('./api');

function callOrderService(action, data = {}) {
  return callApiService('orderService', { action, ...data });
}

function createOrder(order, userProfile) {
  return callOrderService('createOrder', { order, userProfile })
    .then((res) => rejectOnFailure(res, '创建订单失败'));
}

function listUserOrders() {
  return callOrderService('listUserOrders');
}

function listMerchantOrders(storeId) {
  return callOrderService('listMerchantOrders', { store_id: storeId });
}

function updateOrder(orderId, updates) {
  return callOrderService('updateOrder', { order_id: orderId, updates })
    .then((res) => rejectOnFailure(res, '更新订单失败'));
}

module.exports = {
  createOrder,
  listUserOrders,
  listMerchantOrders,
  updateOrder
};
