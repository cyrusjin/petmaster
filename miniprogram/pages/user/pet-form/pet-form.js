const app = getApp();
const datePicker = require('../../../utils/datePicker');
const { ensureLogin } = require('../../../utils/api');
const {
  PET_TYPES,
  validatePetForm,
  buildPetPayload,
  uploadPetPhoto,
  normalizePetType,
  normalizePetHealthFields
} = require('../../../utils/petForm');

function createDefaultHealthFields() {
  return {
    vaccination: '',
    dewormDate: '',
    allergyStatus: '',
    allergy: '',
    medicalHistoryStatus: '',
    medicalHistory: '',
    isPregnant: '',
    inHeat: '',
    isNeutered: '',
    hasDogLicense: ''
  };
}

Page({
  data: {
    id: '',
    name: '',
    petType: '',
    breed: '',
    gender: '',
    age: '',
    weight: '',
    color: '',
    photo: '',
    character: '',
    dietTaboo: '',
    specialCare: '',
    remark: '',
    ...createDefaultHealthFields(),
    petTypes: PET_TYPES,
    saving: false,
    showDewormDatePicker: false,
    dateYears: [],
    dateMonths: [],
    dateDays: [],
    datePickerValue: [0, 0, 0],
    dateMax: null
  },

  onLoad(opts) {
    if (opts.id) {
      const pet = app.getPets().find((p) => p.id === opts.id);
      if (pet) {
        const petType = normalizePetType(pet.type || pet.petType);
        const health = normalizePetHealthFields(pet);
        this.setData({
          ...pet,
          ...health,
          petType
        });
        return;
      }
    }
    this.setData(createDefaultHealthFields());
  },

  onChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (r) => {
        this.setData({ photo: r.tempFiles[0].tempFilePath });
      }
    });
  },

  onField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onSelectPetType(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    this.setData({ petType: value });
  },

  onOpenDewormDatePicker() {
    const state = datePicker.buildPickerState(this.data.dewormDate);
    this.setData({
      showDewormDatePicker: true,
      dateYears: state.years,
      dateMonths: state.months,
      dateDays: state.days,
      datePickerValue: state.datePickerValue,
      dateMax: state.maxDate
    });
  },

  onDatePickerChange(e) {
    const value = e.detail.value;
    const refreshed = datePicker.refreshPickerData(this.data.dateYears, value, this.data.dateMax);
    this.setData({
      datePickerValue: refreshed.datePickerValue,
      dateMonths: refreshed.months,
      dateDays: refreshed.days
    });
  },

  onConfirmDewormDate() {
    const { dateYears, dateMonths, dateDays, datePickerValue, dateMax } = this.data;
    const dewormDate = datePicker.valueToDateString(
      dateYears,
      dateMonths,
      dateDays,
      datePickerValue,
      dateMax
    );
    this.setData({ dewormDate, showDewormDatePicker: false });
  },

  onCancelDewormDate() {
    this.setData({ showDewormDatePicker: false });
  },

  onDatePanelTap() {},

  onRadio(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const patch = { [field]: value };
    if (field === 'allergyStatus' && value === '否') {
      patch.allergy = '';
    }
    if (field === 'medicalHistoryStatus' && value === '否') {
      patch.medicalHistory = '';
    }
    this.setData(patch);
  },

  onSave() {
    const err = validatePetForm(this.data);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    if (this.data.saving) return;

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    ensureLogin()
      .then(() => uploadPetPhoto(this.data.photo))
      .then((photo) => {
        const payload = buildPetPayload({ ...this.data, photo });
        return app.savePet(payload);
      })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({
          title: (error && error.message) || '保存失败',
          icon: 'none',
          duration: 3000
        });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  }
});
