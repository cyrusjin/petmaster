const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const pets = db.collection('pets');
const users = db.collection('users');

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

function normalizeYesNoStatus(value, fallback = '否') {
  return isYesNo(value) ? value : fallback;
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
  if (
    text.startsWith('cloud://')
    || text.startsWith('https://')
    || text.startsWith('http://')
  ) {
    return text;
  }
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

async function ensureCollection() {
  try {
    await db.createCollection('pets');
  } catch (err) {
    const msg = err && (err.errMsg || err.message || String(err));
    if (!msg.includes('already exists') && !msg.includes('已存在') && !msg.includes('Table exist')) {
      console.warn('createCollection pets skipped:', msg);
    }
  }
}

async function getUserDoc(openid) {
  const { data } = await users.where({ openid }).limit(1).get();
  return data[0] || null;
}

async function addPetIdToUser(openid, petId) {
  const user = await getUserDoc(openid);
  if (!user) return;
  const petIds = normalizePetIds(user.pet_ids);
  if (petIds.includes(petId)) return;
  await users.doc(user._id).update({
    data: {
      pet_ids: [...petIds, petId],
      updateTime: Date.now()
    }
  });
}

async function removePetIdFromUser(openid, petId) {
  const user = await getUserDoc(openid);
  if (!user) return;
  const petIds = normalizePetIds(user.pet_ids).filter((id) => id !== petId);
  await users.doc(user._id).update({
    data: {
      pet_ids: petIds,
      updateTime: Date.now()
    }
  });
}

async function syncUserPetIds(openid, petIds) {
  const user = await getUserDoc(openid);
  if (!user) return;
  await users.doc(user._id).update({
    data: {
      pet_ids: normalizePetIds(petIds),
      updateTime: Date.now()
    }
  });
}

async function fetchPetsByIds(petIds, openid) {
  const ids = normalizePetIds(petIds);
  if (!ids.length) return [];

  const chunks = [];
  for (let i = 0; i < ids.length; i += 20) {
    chunks.push(ids.slice(i, i + 20));
  }

  const results = [];
  for (const chunk of chunks) {
    const { data } = await pets.where({
      pet_id: _.in(chunk),
      ownerOpenid: openid
    }).get();
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

async function listPets() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  await ensureCollection();
  const user = await getUserDoc(OPENID);
  let petIds = normalizePetIds(user && user.pet_ids);

  if (!petIds.length) {
    const { data } = await pets.where({ ownerOpenid: OPENID }).orderBy('updateTime', 'desc').get();
    if (data.length) {
      petIds = data.map((item) => item.pet_id);
      await syncUserPetIds(OPENID, petIds);
    }
    return { success: true, pets: data.map(formatPet) };
  }

  const ownedPets = await fetchPetsByIds(petIds, OPENID);
  return { success: true, pets: ownedPets };
}

async function savePet(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const pet = event.pet || {};
  const errMsg = validateBasicFields(pet) || validateHealthFields(pet);
  if (errMsg) return { success: false, errMsg };

  await ensureCollection();
  const now = Date.now();
  const petData = buildPetData(pet, OPENID);
  const petId = (pet.pet_id || pet.id || '').trim();

  if (petId) {
    const { data } = await pets.where({ pet_id: petId, ownerOpenid: OPENID }).limit(1).get();
    if (!data.length) return { success: false, errMsg: '宠物档案不存在' };
    const existing = data[0];
    if (!petData.photo && existing.photo) {
      petData.photo = existing.photo;
    }
    await pets.doc(existing._id).update({ data: petData });
    await addPetIdToUser(OPENID, petId);
    const { data: updated } = await pets.doc(existing._id).get();
    return { success: true, pet: formatPet(updated) };
  }

  const newPet = {
    pet_id: buildPetId(),
    ...petData,
    createTime: now
  };
  await pets.add({ data: newPet });
  await addPetIdToUser(OPENID, newPet.pet_id);
  return { success: true, pet: formatPet(newPet) };
}

async function deletePet(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const petId = (event.pet_id || event.id || '').trim();
  if (!petId) return { success: false, errMsg: '缺少 pet_id' };

  const { data } = await pets.where({ pet_id: petId, ownerOpenid: OPENID }).limit(1).get();
  if (!data.length) return { success: false, errMsg: '宠物档案不存在' };

  await pets.doc(data[0]._id).remove();
  await removePetIdFromUser(OPENID, petId);
  return { success: true };
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'listPets':
        return await listPets();
      case 'savePet':
        return await savePet(event);
      case 'deletePet':
        return await deletePet(event);
      default:
        return { success: false, errMsg: '未知操作' };
    }
  } catch (err) {
    console.error('petService error', err);
    return {
      success: false,
      errMsg: (err && (err.errMsg || err.message)) || '云函数执行失败'
    };
  }
};
