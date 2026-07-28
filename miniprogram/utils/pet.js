const { callApiService, rejectOnFailure } = require('./api');

function callPetService(action, data = {}) {
  return callApiService('petService', { action, ...data });
}

function listPets() {
  return callPetService('listPets').then((res) => rejectOnFailure(res, '加载宠物失败'));
}

function savePet(pet) {
  return callPetService('savePet', { pet }).then((res) => rejectOnFailure(res, '保存宠物失败'));
}

function deletePet(petId) {
  return callPetService('deletePet', { pet_id: petId }).then((res) => rejectOnFailure(res, '删除宠物失败'));
}

module.exports = { listPets, savePet, deletePet };
