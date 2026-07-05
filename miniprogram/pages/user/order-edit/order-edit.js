const app = getApp();
const util = require('../../../utils/util');
const { calcStayFeeBreakdown, formatMoney } = require('../../../utils/billing');
const timePicker = require('../../../utils/timePicker');
const { validateReserveContact } = require('../../../utils/reserveContact');
const { validatePickupInfo, buildPickupPayload } = require('../../../utils/pickupInfo');
const { calcPickupShippingFee, canCalcDistancePickupFee } = require('../../../utils/pickupPricing');
const { choosePickupLocation, formatLocationAddress, getPickupLocationValidationMessage } = require('../../../utils/location');
const { isOrderEditTimeOnly } = require('../../../utils/orderActions');
const { showValidationAlert } = require('../../../utils/formAlert');

function getTodayStr() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    order: {},
    store: null,
    timeOnly: false,
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    minDate: getTodayStr(),
    contactName: '',
    contactPhone: '',
    emergencyPhone: '',
    specialNeeds: '',
    needPickup: false,
    pickupAddress: '',
    pickupLocationName: '',
    pickupLatitude: '',
    pickupLongitude: '',
    pickupContactPhone: '',
    pickupLeg: 'both',
    feeReady: false,
    totalFeeText: '0',
    showTimePicker: false,
    timePickerTarget: '',
    timePickerTitle: '',
    timeHours: [],
    timeMinutes: [],
    timePickerValue: [10, 0]
  },

  onLoad(opts) {
    this.orderId = opts.id;
    this._choosingPickupLocation = false;
    this._loadOrder();
  },

  onShow() {
    if (this._choosingPickupLocation) {
      this._choosingPickupLocation = false;
    }
  },

  _loadOrder() {
    const order = app.getOrders().find((o) => o.id === this.orderId);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const timeOnly = isOrderEditTimeOnly(order.status);
    const store = app.getUserStoreView() || { hasPickup: order.needPickup };
    this.setData({
      order,
      store,
      timeOnly,
      startDate: order.startDate,
      endDate: order.endDate,
      startTime: order.startTime,
      endTime: order.endTime,
      contactName: order.contactName || '',
      contactPhone: order.contactPhone || order.userPhone || '',
      emergencyPhone: order.emergencyPhone || '',
      specialNeeds: order.specialNeeds || '',
      needPickup: !!order.needPickup,
      pickupAddress: order.pickupAddress || '',
      pickupLocationName: order.pickupLocationName || '',
      pickupLatitude: order.pickupLatitude,
      pickupLongitude: order.pickupLongitude,
      pickupContactPhone: order.pickupContactPhone || '',
      pickupLeg: order.pickupIncludeOutbound === false
        ? 'return'
        : (order.pickupIncludeReturn === false ? 'outbound' : 'both')
    });
    this.calcFee();
  },

  _getPickupFlags() {
    const { pickupLeg } = this.data;
    return {
      pickupIncludeOutbound: pickupLeg === 'both' || pickupLeg === 'outbound',
      pickupIncludeReturn: pickupLeg === 'both' || pickupLeg === 'return'
    };
  },

  onDateSelect(e) {
    if (this.data.timeOnly) {
      this.setData({
        startDate: this.data.order.startDate,
        endDate: e.detail.endDate || e.detail.startDate
      });
    } else {
      this.setData({
        startDate: e.detail.startDate,
        endDate: e.detail.endDate
      });
    }
    this.calcFee();
  },

  onOpenStartTimePicker() {
    const state = timePicker.buildPickerState(this.data.startTime, '10:00');
    this.setData({
      showTimePicker: true,
      timePickerTarget: 'start',
      timePickerTitle: '选择入住时间',
      timeHours: state.hours,
      timeMinutes: state.minutes,
      timePickerValue: state.timePickerValue
    });
  },

  onOpenEndTimePicker() {
    const state = timePicker.buildPickerState(this.data.endTime, '18:00');
    this.setData({
      showTimePicker: true,
      timePickerTarget: 'end',
      timePickerTitle: '选择离店时间',
      timeHours: state.hours,
      timeMinutes: state.minutes,
      timePickerValue: state.timePickerValue
    });
  },

  onTimePickerChange(e) {
    this.setData({ timePickerValue: e.detail.value });
  },

  onConfirmTimePicker() {
    const { timeHours, timeMinutes, timePickerValue, timePickerTarget } = this.data;
    const time = timePicker.valueToTimeString(timeHours, timeMinutes, timePickerValue);
    if (timePickerTarget === 'start') {
      this.setData({ startTime: time, showTimePicker: false });
    } else {
      this.setData({ endTime: time, showTimePicker: false });
    }
    this.calcFee();
  },

  onCancelTimePicker() {
    this.setData({ showTimePicker: false });
  },

  onTimePanelTap() {},

  onContactNameInput(e) { this.setData({ contactName: (e.detail.value || '').trim() }); },
  onContactPhoneInput(e) { this.setData({ contactPhone: (e.detail.value || '').trim() }); },
  onEmergencyPhoneInput(e) { this.setData({ emergencyPhone: (e.detail.value || '').trim() }); },
  onSpecialInput(e) { this.setData({ specialNeeds: e.detail.value }); },

  onPickupChange(e) {
    const needPickup = e.detail.value;
    const patch = { needPickup };
    if (!needPickup) {
      patch.pickupAddress = '';
      patch.pickupLocationName = '';
      patch.pickupLatitude = '';
      patch.pickupLongitude = '';
      patch.pickupContactPhone = '';
      patch.pickupLeg = 'both';
    }
    this.setData(patch);
    this.calcFee();
  },

  onPickupPhoneInput(e) {
    this.setData({ pickupContactPhone: (e.detail.value || '').trim() });
  },

  onPickupLegChange(e) {
    this.setData({ pickupLeg: e.detail.value || 'both' }, () => this.calcFee());
  },

  onChoosePickupAddress() {
    this._choosingPickupLocation = true;
    choosePickupLocation({
      latitude: this.data.pickupLatitude,
      longitude: this.data.pickupLongitude
    })
      .then((res) => {
        const validationMsg = getPickupLocationValidationMessage(res);
        if (validationMsg) {
          this._choosingPickupLocation = false;
          wx.showToast({ title: validationMsg, icon: 'none' });
          return;
        }
        this.setData({
          pickupAddress: formatLocationAddress(res),
          pickupLocationName: (res.name || '').trim(),
          pickupLatitude: res.latitude,
          pickupLongitude: res.longitude
        }, () => this.calcFee());
      })
      .catch(() => {
        this._choosingPickupLocation = false;
      });
  },

  calcFee() {
    const { order, timeOnly, startDate, endDate, startTime, endTime, needPickup, store } = this.data;
    const useStartDate = timeOnly ? order.startDate : startDate;
    const useStartTime = timeOnly ? order.startTime : startTime;
    if (!useStartDate || !endDate || !useStartTime || !endTime) {
      this.setData({ feeReady: false, totalFeeText: '0' });
      return;
    }

    const rules = app.getStoreBillingRules();
    const basePrice = order.basePrice || util.getPriceByMode(rules, order.petWeight, order.roomType);
    const breakdown = calcStayFeeBreakdown(
      useStartDate, endDate, useStartTime, endTime, rules, basePrice
    );
    const storeView = store || {};
    const pickupFlags = this._getPickupFlags();
    const pickupReady = !needPickup || storeView.pickupPricingMode !== 'distance'
      || canCalcDistancePickupFee(storeView, this.data.pickupLatitude, this.data.pickupLongitude);
    const pickupFee = needPickup && pickupReady
      ? calcPickupShippingFee({
        store: storeView,
        ...pickupFlags,
        pickupLatitude: this.data.pickupLatitude,
        pickupLongitude: this.data.pickupLongitude
      })
      : 0;
    const totalFee = breakdown.baseFee + pickupFee;

    this.setData({
      feeReady: breakdown.ready && (!needPickup || pickupReady),
      totalFeeText: formatMoney(totalFee),
      _feePayload: {
        days: breakdown.days,
        boardingFee: breakdown.baseFee,
        shippingFee: pickupFee,
        totalFee,
        feeSnapshot: {
          basePrice,
          dailyBreakdown: breakdown.dailyBreakdown,
          chargeSummary: breakdown.chargeSummary,
          daysText: breakdown.daysText
        },
        basePrice
      }
    });
  },

  onSubmit() {
    const { order, timeOnly, feeReady, _feePayload } = this.data;
    if (!feeReady || !_feePayload) {
      showValidationAlert('请完善时间信息');
      return;
    }

    if (!timeOnly) {
      const contactErr = validateReserveContact(this.data.contactName, this.data.contactPhone);
      if (contactErr) {
        showValidationAlert(contactErr);
        return;
      }
      if (this.data.needPickup) {
        const pickupErr = validatePickupInfo({
          needPickup: true,
          pickupAddress: this.data.pickupAddress,
          pickupLatitude: this.data.pickupLatitude,
          pickupLongitude: this.data.pickupLongitude,
          pickupContactPhone: this.data.pickupContactPhone,
          pickupTime: order.pickupTime || order.startTime,
          ...this._getPickupFlags()
        });
        if (pickupErr) {
          showValidationAlert(pickupErr);
          return;
        }
      }
    }

    const updates = {
      ..._feePayload,
      endDate: this.data.endDate,
      endTime: this.data.endTime
    };

    if (!timeOnly) {
      Object.assign(updates, {
        startDate: this.data.startDate,
        startTime: this.data.startTime,
        contactName: this.data.contactName,
        contactPhone: this.data.contactPhone,
        emergencyPhone: this.data.emergencyPhone,
        specialNeeds: this.data.specialNeeds,
        ...buildPickupPayload({
          needPickup: this.data.needPickup,
          pickupAddress: this.data.pickupAddress,
          pickupLocationName: this.data.pickupLocationName,
          pickupLatitude: this.data.pickupLatitude,
          pickupLongitude: this.data.pickupLongitude,
          pickupContactPhone: this.data.pickupContactPhone,
          pickupTime: order.pickupTime || this.data.startTime,
          ...this._getPickupFlags()
        })
      });
    }

    wx.showLoading({ title: '保存中' });
    app.updateOrder(order.id, updates)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  }
});
