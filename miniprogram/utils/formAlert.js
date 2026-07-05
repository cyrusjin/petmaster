function showValidationAlert(message, title = '请完善信息') {
  wx.showModal({
    title,
    content: message,
    showCancel: false,
    confirmColor: '#1D3D7A'
  });
}

module.exports = { showValidationAlert };
