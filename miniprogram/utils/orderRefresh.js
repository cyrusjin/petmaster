const merchantDemo = require('./merchantDemo');

function refreshMerchantOrders(app, options = {}) {
  const force = !!(options && options.force);
  if (app.isMerchantDemoMode()) {
    merchantDemo.ensureDemoData();
    return Promise.resolve(app.getOrders());
  }
  return app.ensureCloudAndLogin({ silent: !force })
    .then(() => {
      if (!app.canAccessMerchantBackend()) return null;
      return app.ensureMerchantStore().then((shop) => {
        if (!shop || !shop.store_id) return null;
        return app.loadOrders({ force });
      });
    });
}

function refreshUserOrders(app, options = {}) {
  const force = !!(options && options.force);
  if (app.isMerchantDemoMode()) {
    return Promise.resolve();
  }
  return app.ensureCloudAndLogin({ silent: !force })
    .then(() => app.syncUserFeed({ force }));
}

function refreshSingleOrder(app, orderId, options = {}) {
  const force = !!(options && options.force);
  if (!orderId) return Promise.resolve(null);

  if (app.canAccessMerchantBackend() && !app.isUserClientMode()) {
    return refreshMerchantOrders(app, { force }).then(() => (
      app.getOrders().find((o) => o.id === orderId) || null
    ));
  }

  return refreshUserOrders(app, { force }).then(() => (
    app.getOrders().find((o) => o.id === orderId) || null
  ));
}

module.exports = {
  refreshMerchantOrders,
  refreshUserOrders,
  refreshSingleOrder
};
