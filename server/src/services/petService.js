const db = require('../db');
const oss = require('../oss');
const identity = require('./identity');

const PET_TYPES = ['小型犬', '中型犬', '大型犬', '猫咪', '其他'];
const YES_NO_VALUES = ['是', '否'];

function buildPetId() {
  return 'pet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizePetIds(petIds) {
  if (!Array.isArray(petIds)) return [];
  return [...new Set(petIds.filter((id) => typeof id === 'string' && id.trim()))];
}

function normalizePetType(type) {
  const text = (type || '').trim();
  if (text === '其他宠物') return '其他';
  return PET_TYPES.includes(text) ? text : '';
}

function isYesNo(value) {
  return YES_NO_VALUES.includes(value);
}

function normalizePetHealthFields(pet) {
  const source = pet || {};
  let allergyStatus = isYesNo(source.allergyStatus) ? source.allergyStatus : '';
  let allergy = String(source.allergy || '').trim();
  let medicalHistoryStatus = isYesNo(source.medicalHistoryStatus) ? source.medicalHistoryStatus : '';
  let medicalHistory = String(source.medicalHistory || '').trim();

  if (!source.allergyStatus && allergy) allergyStatus = '是';
  if (!source.medicalHistoryStatus && medicalHistory) medicalHistoryStatus = '是';
  if (allergyStatus === '否') allergy = '';
  if (medicalHistoryStatus === '否') medicalHistory = '';

  return {
    vaccination: source.vaccination || '',
    dewormDate: source.dewormDate || '',
    allergyStatus,
    allergy,
    medicalHistoryStatus,
    medicalHistory,
    isPregnant: source.isPregnant || '',
    inHeat: source.inHeat || '',
    isNeutered: source.isNeutered || '',
    hasDogLicense: source.hasDogLicense || ''
  };
}

function formatPet(doc) {
  const health = normalizePetHealthFields(doc);
  return {
    pet_id: doc.pet_id,
    id: doc.pet_id,
    ownerOpenid: doc.ownerOpenid || '',
    name: doc.name || '',
    type: doc.type || '',
    breed: doc.breed || '',
    gender: doc.gender || '',
    age: doc.age != null ? String(doc.age) : '',
    weight: doc.weight != null ? String(doc.weight) : '',
    color: doc.color || '',
    photo: doc.photo || '',
    vaccination: health.vaccination,
    dewormDate: health.dewormDate,
    allergyStatus: health.allergyStatus,
    allergy: health.allergy,
    medicalHistoryStatus: health.medicalHistoryStatus,
    medicalHistory: health.medicalHistory,
    isPregnant: health.isPregnant,
    inHeat: health.inHeat,
    isNeutered: health.isNeutered,
    hasDogLicense: health.hasDogLicense,
    character: doc.character || '',
    dietTaboo: doc.dietTaboo || '',
    specialCare: doc.specialCare || '',
    remark: doc.remark || '',
    createTime: doc.createTime,
    updateTime: doc.updateTime
  };
}

function validateHealthFields(pet) {
  const health = normalizePetHealthFields(pet);
  if (health.vaccination !== '已接种' && health.vaccination !== '未接种') {
    return '请选择疫苗接种情况';
  }
  if (!health.dewormDate) return '请选择驱虫时间';
  if (!isYesNo(health.allergyStatus)) return '请选择是否有过敏史';
  if (health.allergyStatus === '是' && !health.allergy) return '请填写过敏史详情';
  if (!isYesNo(health.medicalHistoryStatus)) return '请选择是否有既往病史';
  if (health.medicalHistoryStatus === '是' && !health.medicalHistory) return '请填写既往病史详情';
  if (!isYesNo(health.isPregnant)) return '请选择是否怀孕';
  if (!isYesNo(health.inHeat)) return '请选择是否发情';
  if (!isYesNo(health.isNeutered)) return '请选择是否绝育';
  if (!isYesNo(health.hasDogLicense)) return '请选择是否办理犬证';
  return '';
}

function validateBasicFields(pet) {
  if (!pet.name || !String(pet.name).trim()) return '请输入宠物名称';
  if (!normalizePetType(pet.type)) return '请选择宠物类型';
  if (!pet.breed || !String(pet.breed).trim()) return '请输入品种';
  if (pet.gender !== '公' && pet.gender !== '母') return '请选择性别';
  const age = parseFloat(pet.age);
  if (!Number.isFinite(age) || age <= 0) return '请输入有效年龄';
  const weight = parseFloat(pet.weight);
  if (!Number.isFinite(weight) || weight <= 0) return '请输入有效体重';
  if (!pet.color || !String(pet.color).trim()) return '请输入毛色';
  return '';
}

function normalizePhoto(photo) {
  if (!photo || typeof photo !== 'string') return '';
  const text = photo.trim();
  if (!text) return '';
  if (oss.isStoredMedia(text)) return text;
  return '';
}

function buildPetData(pet, ownerOpenid) {
  const now = Date.now();
  const health = normalizePetHealthFields(pet);
  return {
    ownerOpenid,
    name: String(pet.name || '').trim(),
    type: normalizePetType(pet.type),
    breed: String(pet.breed || '').trim(),
    gender: pet.gender === '母' ? '母' : '公',
    age: String(pet.age),
    weight: String(pet.weight),
    color: String(pet.color || '').trim(),
    photo: normalizePhoto(pet.photo),
    vaccination: health.vaccination,
    dewormDate: health.dewormDate,
    allergyStatus: health.allergyStatus,
    allergy: health.allergy,
    medicalHistoryStatus: health.medicalHistoryStatus,
    medicalHistory: health.medicalHistory,
    isPregnant: health.isPregnant,
    inHeat: health.inHeat,
    isNeutered: health.isNeutered,
    hasDogLicense: health.hasDogLicense,
    character: pet.character || '',
    dietTaboo: pet.dietTaboo || '',
    specialCare: pet.specialCare || '',
    remark: pet.remark || '',
    updateTime: now
  };
}

async function getUserDoc(openid) {
  return identity.findPrimaryUserByOpenid(openid);
}

async function addPetIdToUser(openid, petId) {
  const user = await getUserDoc(openid);
  if (!user) return;
  const petIds = normalizePetIds(user.pet_ids);
  if (petIds.includes(petId)) return;
  await db.updateById('users', user._id, {
    pet_ids: [...petIds, petId],
    updateTime: Date.now()
  });
}

async function removePetIdFromUser(openid, petId) {
  const user = await getUserDoc(openid);
  if (!user) return;
  const petIds = normalizePetIds(user.pet_ids).filter((id) => id !== petId);
  await db.updateById('users', user._id, {
    pet_ids: petIds,
    updateTime: Date.now()
  });
}

async function syncUserPetIds(openid, petIds) {
  const user = await getUserDoc(openid);
  if (!user) return;
  await db.updateById('users', user._id, {
    pet_ids: normalizePetIds(petIds),
    updateTime: Date.now()
  });
}

async function fetchPetsByIds(petIds, openid) {
  const ids = normalizePetIds(petIds);
  if (!ids.length) return [];

  const results = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const data = await db.findMany('pets', {
      pet_id: { $in: chunk },
      ownerOpenid: openid
    });
    results.push(...data);
  }

  const orderMap = {};
  ids.forEach((id, index) => {
    orderMap[id] = index;
  });

  return results
    .map(formatPet)
    .sort((a, b) => {
      const timeDiff = (b.updateTime || 0) - (a.updateTime || 0);
      if (timeDiff !== 0) return timeDiff;
      return (orderMap[a.pet_id] || 0) - (orderMap[b.pet_id] || 0);
    });
}

async function listPets(openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  await db.ensureCollections(['pets']);
  const user = await getUserDoc(openid);
  let petIds = normalizePetIds(user && user.pet_ids);

  if (!petIds.length) {
    const data = await db.findMany('pets', { ownerOpenid: openid }, {
      sort: { updateTime: -1 }
    });
    if (data.length) {
      petIds = data.map((item) => item.pet_id);
      await syncUserPetIds(openid, petIds);
    }
    return { success: true, pets: data.map(formatPet) };
  }

  const ownedPets = await fetchPetsByIds(petIds, openid);
  return { success: true, pets: ownedPets };
}

async function savePet(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const pet = event.pet || {};
  const errMsg = validateBasicFields(pet) || validateHealthFields(pet);
  if (errMsg) return { success: false, errMsg };

  await db.ensureCollections(['pets']);
  const now = Date.now();
  const petData = buildPetData(pet, openid);
  const petId = (pet.pet_id || pet.id || '').trim();

  if (petId) {
    const data = await db.findMany('pets', { pet_id: petId, ownerOpenid: openid }, { limit: 1 });
    if (!data.length) return { success: false, errMsg: '宠物档案不存在' };
    const existing = data[0];
    if (!petData.photo && existing.photo) {
      petData.photo = existing.photo;
    }
    const updated = await db.updateById('pets', existing._id, petData);
    await addPetIdToUser(openid, petId);
    return { success: true, pet: formatPet(updated) };
  }

  const newPet = {
    pet_id: buildPetId(),
    ...petData,
    createTime: now
  };
  await db.insertOne('pets', newPet);
  await addPetIdToUser(openid, newPet.pet_id);
  return { success: true, pet: formatPet(newPet) };
}

async function deletePet(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const petId = (event.pet_id || event.id || '').trim();
  if (!petId) return { success: false, errMsg: '缺少 pet_id' };

  const data = await db.findMany('pets', { pet_id: petId, ownerOpenid: openid }, { limit: 1 });
  if (!data.length) return { success: false, errMsg: '宠物档案不存在' };

  await db.deleteById('pets', data[0]._id);
  await removePetIdFromUser(openid, petId);
  return { success: true };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'listPets':
      return listPets(openid);
    case 'savePet':
      return savePet(event, openid);
    case 'deletePet':
      return deletePet(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = { handle };
