// 👇 新增在 advanced-convo-engine.js 內
const fs = require("fs");
const path = "userdata.json";

function load() {
  if (!fs.existsSync(path)) fs.writeFileSync(path, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(path));
}

function save(data) {
  fs.writeFileSync(path, JSON.stringify(data));
}

function getUserAll(userId) {
  const d = load();
  return d[userId] || {};
}

function getUserStep(userId) {
  const d = load();
  return d[userId]?.step ?? -1;
}

function updateUserStep(userId, field, value, nextStep) {
  const d = load();
  if (!d[userId]) d[userId] = {};
  d[userId][field] = value;
  d[userId].step = nextStep;
  save(d);
}

function setMode(userId, mode) {
  const d = load();
  if (!d[userId]) d[userId] = {};
  d[userId].mode = mode;
  save(d);
}

function getMode(userId) {
  const d = load();
  return d[userId]?.mode || "AI";
}

module.exports = {
  getUserAll,
  getUserStep,
  updateUserStep,
  setMode,
  getMode
};
