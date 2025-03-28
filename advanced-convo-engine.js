
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
function setModeWithExpire(userId, mode, durationMs) {
  const d = load();
  if (!d[userId]) d[userId] = {};
  d[userId].mode = mode;
  if (mode === "human") {
    d[userId].modeExpiresAt = Date.now() + durationMs;
  } else {
    delete d[userId].modeExpiresAt;
  }
  save(d);
}
function getEffectiveMode(userId) {
  const d = load();
  const mode = d[userId]?.mode || "AI";
  const expires = d[userId]?.modeExpiresAt;
  if (mode === "human" && expires && Date.now() > expires) {
    d[userId].mode = "AI";
    delete d[userId].modeExpiresAt;
    save(d);
    return "AI";
  }
  return mode;
}

module.exports = {
  getUserAll,
  getUserStep,
  updateUserStep,
  setModeWithExpire,
  getEffectiveMode
};
