const { callCloudFunction } = require('./cloudCall');

function callPetService(action, data = {}) {
  return callCloudFunction('petService', { action, ...data });
}

function listPets() {
  return callPetService('listPets');
}

function savePet(pet) {
  return callPetService('savePet', { pet });
}

function deletePet(petId) {
  return callPetService('deletePet', { pet_id: petId });
}

module.exports = { listPets, savePet, deletePet };
