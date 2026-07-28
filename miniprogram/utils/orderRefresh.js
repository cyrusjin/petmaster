function refreshUserOrders(app, options = {}) {
  const force = !!(options && options.force);
  const skipDailyLogs = !!(options && options.skipDailyLogs);
  return app.ensureCloudAndLogin({ silent: !force })
    .then(() => app.syncUserFeed({ force, skipDailyLogs }));
}

function refreshSingleOrder(app, orderId, options = {}) {
  const force = !!(options && options.force);
  if (!orderId) return Promise.resolve(null);
  return refreshUserOrders(app, { force }).then(() => (
    app.getOrders().find((o) => o.id === orderId) || null
  ));
}

module.exports = {
  refreshUserOrders,
  refreshSingleOrder
};
