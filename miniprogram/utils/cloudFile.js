const {
  isCloudFileId,
  isHttpUrl,
  resolveImageUrl,
  resolveImageUrls
} = require('./imageCache');

function resolveOneCloudFile(fileID) {
  return resolveImageUrl(fileID || '');
}

function resolveCloudFileUrls(urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);
  return resolveImageUrls(list);
}

function resolveStoreDisplayUrls(store) {
  if (!store) return Promise.resolve(null);

  const storePhotos = Array.isArray(store.storePhotos) ? store.storePhotos.filter(Boolean) : [];
  const logo = store.logo || '';
  const remoteList = [logo, ...storePhotos].filter((url) => url && (isCloudFileId(url) || isHttpUrl(url)));

  if (!remoteList.length) {
    return Promise.resolve({
      ...store,
      storePhotos,
      logo: logo || ''
    });
  }

  return Promise.all([
    resolveCloudFileUrls(storePhotos),
    logo ? resolveImageUrl(logo) : Promise.resolve('')
  ]).then(([resolvedPhotos, resolvedLogo]) => ({
    ...store,
    storePhotos: resolvedPhotos.filter(Boolean),
    logo: resolvedLogo || logo || ''
  }));
}

module.exports = {
  isCloudFileId,
  isHttpUrl,
  resolveOneCloudFile,
  resolveCloudFileUrls,
  resolveStoreDisplayUrls
};
