const fs = require("fs");
const FILE = "userdata.json";

const STEP = {
  COMPANY: 1,
  INDUSTRY: 2,
  NEED: 3,
  BUDGET: 4,
  TIME: 5,
  CONTACT: 6,
  MODE: 7,
  DONE: 8
};

function load() {
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data));
}

function getUserStep(userId) {
  const data = load();
  return data[userId]?.step || STEP.COMPANY;
}

function updateUserStep(userId, key, value, nextStep) {
  const data = load();
  if (!data[userId]) data[userId] = { step: STEP.COMPANY };
  data[userId][key] = value;
  data[userId].step = nextStep;
  save(data);
}

function getUserAll(userId) {
  const data = load();
  return data[userId] || {};
}

function resetUser(userId) {
  const data = load();
  delete data[userId];
  save(data);
}

module.exports = {
  STEP,
  getUserStep,
  updateUserStep,
  getUserAll,
  resetUser
};