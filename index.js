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
const adminUserId = "U7411fd19912bc8f916d32106bc5940a3";

let manualMode = false;
const MANUAL_FILE = "manual_mode.json";

// 檢查並載入手動模式
if (fs.existsSync(MANUAL_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(MANUAL_FILE));
    manualMode = data.manualMode;
  } catch (e) {
    console.log("🔧 無法讀取 manual_mode.json，預設為 false");
  }
}

function saveManualMode(value) {
  fs.writeFileSync(MANUAL_FILE, JSON.stringify({ manualMode: value }));
}

const faqReplies = {
  "電話": "我們的電話是：0937-092-518",
  "聯絡方式": "我們的聯絡方式：電話 0937-092-518，Email：inchi.image@gmail.com",
  "email": "我們的 Email 是：inchi.image@gmail.com",
  "營業時間": "我們的營業時間是週一至週五 10:00-18:30",
  "地址": "我們地址是新北市板橋區光復街203號"
};

const sensitiveKeywords = ["幹", "媽的", "靠北", "他媽", "死"];

app.post("/webhook", async (req, res) => {
  res.status(200).send("OK");
  const events = req.body.events;
  for (let event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const message = event.message.text;

      // 控制模式（選單）
      if (message === "切換客服模式" && userId === adminUserId) {
        return sendCustomerModeSelector(event.replyToken);
      }

      // 控制模式（指令）
      if (userId === adminUserId) {
        if (message === "/manual on") {
          manualMode = true;
          saveManualMode(true);
          return replyText(event.replyToken, "✅ 已切換至 *手動回覆模式*，Bot 暫停回覆。");
        } else if (message === "/manual off") {
          manualMode = false;
          saveManualMode(false);
          return replyText(event.replyToken, "🤖 已切換至 *自動回覆模式*，Bot 開始工作囉！");
        }
      }

      if (manualMode && userId !== adminUserId) return;

      // 不當字詞過濾
      if (sensitiveKeywords.some(word => message.includes(word))) {
        return replyText(event.replyToken, "⚠️ 為維護良好對話品質，請勿使用不當字詞喔。")
      }

      // FAQ
      const faqKey = Object.keys(faqReplies).find(k => message.includes(k));
      if (faqKey) return replyText(event.replyToken, faqReplies[faqKey]);

      // GPT
      try {
        const gptRes = await axios.post("https://api.openai.com/v1/chat/completions", {
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "你是一位親切的繁體中文真人客服助理，請以繁體中文回答" },
            { role: "user", content: message }
          ]
        }, {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        });

        const reply = gptRes.data.choices[0].message.content;
        await replyText(event.replyToken, reply);
      } catch (err) {
        console.error("GPT error:", err.response?.data || err.message);
        await replyText(event.replyToken, "目前服務繁忙，請稍後再試～");
      }
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

function sendCustomerModeSelector(token) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages: [
      {
        type: "template",
        altText: "請選擇客服模式",
        template: {
          type: "buttons",
          text: "請選擇目前要啟用的客服模式 👇",
          actions: [
            { type: "message", label: "🤖 AI 回覆模式", text: "/manual off" },
            { type: "message", label: "👩‍💼 真人客服模式", text: "/manual on" }
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 LINE GPT Bot 正在監聽 port ${PORT} 🚀`);
});
