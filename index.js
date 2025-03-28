// index.js
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;
const adminUserId = "Ufbbd2498b46be383f9e7df428b5682dd";
const MODE_FILE = "mode.json";

// 永久儲存客服模式狀態
function getManualMode() {
  if (!fs.existsSync(MODE_FILE)) return false;
  const data = JSON.parse(fs.readFileSync(MODE_FILE));
  return data.manualMode;
}
function setManualMode(val) {
  fs.writeFileSync(MODE_FILE, JSON.stringify({ manualMode: val }));
}

const faqReplies = {
  "電話": "我們的電話是：0937-092-518",
  "聯絡方式": "電話：0937-092-518\nEmail：inchi.image@gmail.com",
  "email": "Email：inchi.image@gmail.com",
  "營業時間": "我們的營業時間是週一至週五 10:00-18:30",
  "地址": "我們地址是新北市板橋區光復街203號"
};

const sensitiveKeywords = ["幹", "媽的", "靠北", "他媽", "死"];

app.post("/webhook", async (req, res) => {
  // 🔍 檢查是否在手動聊天模式（LINE 官方觸發）
  if (req.body.mode === "standby") {
    console.log("🧑‍💼 目前是手動聊天模式，Bot 靜音中...");
    return res.status(200).send("Manual chat mode active");
  }

  res.status(200).send("OK");
  const events = req.body.events;

  for (let event of events) {
    if (event.type !== "message" || event.message.type !== "text") return;
    const userId = event.source.userId;
    const msg = event.message.text;

    console.log("🔥 使用者 ID：", userId);

    // 管理員傳送『切換客服模式』 → 彈出按鈕樣板
    if (userId === adminUserId && msg === "切換客服模式") {
      await sendCustomerModeMenu(event.replyToken);
      return;
    }

    // 使用者點選按鈕切換客服模式
    if (userId === adminUserId && msg === "🤖 AI 回覆模式") {
      setManualMode(false);
      await replyText(event.replyToken, "🤖 已切換為 AI 自動回覆模式！");
      return;
    }
    if (userId === adminUserId && msg === "👩‍💼 真人客服模式") {
      setManualMode(true);
      await replyText(event.replyToken, "🧑‍💼 已切換為真人客服接手模式，Bot 將暫停回覆。");
      return;
    }

    // 若為手動客服模式，非管理員就不回覆
    if (getManualMode() && userId !== adminUserId) return;

    // 禁止字詞
    if (sensitiveKeywords.some(word => msg.includes(word))) {
      await replyText(event.replyToken, "⚠️ 為維護良好對話品質，請勿使用不當字詞喔。");
      return;
    }

    // FAQ
    const faqKey = Object.keys(faqReplies).find(key => msg.toLowerCase().includes(key));
    if (faqKey) {
      await replyText(event.replyToken, faqReplies[faqKey]);
      return;
    }

    // 查詢自己的 userId
    if (msg === "/me") {
      await replyText(event.replyToken, `你的使用者 ID 是：\n${userId}`);
      return;
    }

    // 引導報價流程
    const userdata = loadUserData();
    if (!userdata[userId]) {
      userdata[userId] = { step: 1 };
      saveUserData(userdata);
      await replyText(event.replyToken, "👋 歡迎洽詢報價！請問您的公司名稱是？");
      return;
    } else {
      const user = userdata[userId];
      if (user.step === 1) {
        user.company = msg;
        user.step = 2;
        saveUserData(userdata);
        await replyText(event.replyToken, "請問您的產業類型是？");
        return;
      } else if (user.step === 2) {
        user.industry = msg;
        user.step = 3;
        saveUserData(userdata);
        await replyText(event.replyToken, "請問您的主要需求是？");
        return;
      } else if (user.step === 3) {
        user.need = msg;
        user.step = 4;
        saveUserData(userdata);

        await axios.post("https://notify-api.line.me/api/notify",
          new URLSearchParams({
            message: `🔔 有新客戶填寫報價：\n公司：${user.company}\n產業：${user.industry}\n需求：${user.need}`
          }), {
            headers: {
              Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );

        await sendContactOptions(event.replyToken);
        return;
      }
    }

    // GPT 回覆
    try {
      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "你是一位親切的繁體中文真人客服助理，請以繁體中文回答" },
          { role: "user", content: msg }
        ]
      }, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const reply = response.data.choices[0].message.content;
      await replyText(event.replyToken, reply);
    } catch (err) {
      console.error("GPT error:", err.response?.data || err.message);
      await replyText(event.replyToken, "目前服務繁忙，請稍後再試～");
    }
  }
});

function replyText(token, text) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages: [{ type: "text", text }]
  }, {
    headers: {
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
}

function sendCustomerModeMenu(token) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages: [
      {
        type: "template",
        altText: "請選擇要切換的客服模式",
        template: {
          type: "buttons",
          title: "請選擇目前要啟用的客服模式 👇",
          text: "",
          actions: [
            { type: "message", label: "🤖 AI 回覆模式", text: "🤖 AI 回覆模式" },
            { type: "message", label: "👩‍💼 真人客服模式", text: "👩‍💼 真人客服模式" }
          ]
        }
      }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
}

function sendContactOptions(token) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages: [
      {
        type: "flex",
        altText: "請選擇聯絡方式",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              { type: "text", text: "📅 我們可以為您安排與顧問進一步討論～\n請問您希望的聯繫方式是？", wrap: true, weight: "bold", size: "md" },
              {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                  { type: "button", style: "primary", color: "#6366F1", action: { type: "message", label: "1️⃣ LINE", text: "我要用 LINE 聯絡" } },
                  { type: "button", style: "primary", color: "#6366F1", action: { type: "message", label: "2️⃣ 電話", text: "我要電話聯絡" } },
                  { type: "button", style: "primary", color: "#6366F1", action: { type: "message", label: "3️⃣ Email", text: "我要用 Email 聯絡" } },
                  { type: "button", style: "secondary", action: { type: "message", label: "4️⃣ 不用聯繫，我先看看就好", text: "我先看看就好" } }
                ]
              }
            ]
          }
        }
      }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
}

function loadUserData() {
  if (!fs.existsSync("userdata.json")) fs.writeFileSync("userdata.json", JSON.stringify({}));
  return JSON.parse(fs.readFileSync("userdata.json"));
}

function saveUserData(data) {
  fs.writeFileSync("userdata.json", JSON.stringify(data));
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 LINE GPT Bot 正在監聽 port ${PORT} 🚀`);
});
