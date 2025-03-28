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

let manualOffTimer = null;
let isManualMode = false;

const faqReplies = {
  "電話": "我們的電話是：0937-092-518",
  "聯絡方式": "電話：0937-092-518\nEmail：inchi.image@gmail.com",
  "email": "Email：inchi.image@gmail.com",
  "營業時間": "我們的營業時間是週一至週五 10:00-18:30",
  "地址": "我們地址是新北市板橋區光復街203號"
};

const sensitiveKeywords = ["幹", "媽的", "靠北", "他媽", "死"];

app.post("/webhook", async (req, res) => {
  res.status(200).send("OK");
  const events = req.body.events;

  for (let event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const userId = event.source.userId;
    const msg = event.message.text.trim();

    if (msg === "/me") {
      await replyText(event.replyToken, `你的使用者 ID 是：\n${userId}`);
      return;
    }

    // 禁止字詞
    if (sensitiveKeywords.some(word => msg.includes(word))) {
      await replyText(event.replyToken, "⚠️ 為維護良好對話品質，請勿使用不當字詞喔。");
      return;
    }

    if (isManualMode && userId !== adminUserId) return;

    // FAQ
    const faqKey = Object.keys(faqReplies).find(key => msg.toLowerCase().includes(key));
    if (faqKey) {
      await replyText(event.replyToken, faqReplies[faqKey]);
      return;
    }

    // 引導對話流程
    const users = loadUserData();
    if (!users[userId]) {
      users[userId] = { step: 1 };
      saveUserData(users);
      await replyText(event.replyToken, "👋 歡迎洽詢報價！請問您的公司名稱是？");
      return;
    }

    const u = users[userId];
    if (u.step === 1) {
      u.company = msg;
      u.step = 2;
      saveUserData(users);
      await replyText(event.replyToken, "請問您的產業類型是？");
    } else if (u.step === 2) {
      u.industry = msg;
      u.step = 3;
      saveUserData(users);
      await replyText(event.replyToken, "請問您的主要需求是？");
    } else if (u.step === 3) {
      u.need = msg;
      u.step = 4;
      saveUserData(users);
      await sendBudgetOptions(event.replyToken);
    } else if (u.step === 4 && ["3-5萬", "5-10萬", "10萬以上"].includes(msg)) {
      u.budget = msg;
      u.step = 5;
      saveUserData(users);
      await replyText(event.replyToken, "請問您方便聯絡的時間是？（請輸入文字）");
    } else if (u.step === 5) {
      u.time = msg;
      u.step = 6;
      saveUserData(users);
      await sendContactOptions(event.replyToken);
    } else if (u.step === 6 && ["我要用 LINE 聯絡", "我要電話聯絡", "我要用 Email 聯絡"].includes(msg)) {
      u.contact = msg;
      u.step = 7;
      saveUserData(users);

      await axios.post("https://notify-api.line.me/api/notify",
        new URLSearchParams({
          message: `🔔 有新客戶洽詢：\n公司：${u.company}\n產業：${u.industry}\n需求：${u.need}\n預算：${u.budget}\n聯絡時間：${u.time}\n聯絡方式：${u.contact}`
        }), {
          headers: {
            Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      await replyCustomerModeButtons(event.replyToken);
    } else if (u.step === 7 && msg.includes("真人客服")) {
      isManualMode = true;
      await replyText(event.replyToken, "🤝 我們已通知顧問將盡快與您聯繫，1小時後將自動恢復 AI 回覆。");
      setTimeout(() => {
        isManualMode = false;
        console.log("✅ AI 自動回覆已恢復");
      }, 3600 * 1000);
    } else if (u.step === 7 && msg.includes("AI 回覆")) {
      await replyText(event.replyToken, "🤖 好的，我會繼續為您服務～ 有任何問題歡迎詢問！");
    } else {
      // 專業問題 → AI 回答
      try {
        const gpt = await axios.post("https://api.openai.com/v1/chat/completions", {
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

        await replyText(event.replyToken, gpt.data.choices[0].message.content + "\n如需進一步服務，我可以協助您安排顧問聯繫～");
      } catch (e) {
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

function sendBudgetOptions(token) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages: [
      {
        type: "template",
        altText: "請選擇預算區間",
        template: {
          type: "buttons",
          title: "請選擇您的預算區間 💰",
          text: "",
          actions: [
            { type: "message", label: "3-5萬", text: "3-5萬" },
            { type: "message", label: "5-10萬", text: "5-10萬" },
            { type: "message", label: "10萬以上", text: "10萬以上" }
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
            contents: [
              { type: "text", text: "📞 請問您希望的聯繫方式？", wrap: true },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  { type: "button", style: "primary", action: { type: "message", label: "LINE", text: "我要用 LINE 聯絡" } },
                  { type: "button", style: "primary", action: { type: "message", label: "電話", text: "我要電話聯絡" } },
                  { type: "button", style: "primary", action: { type: "message", label: "Email", text: "我要用 Email 聯絡" } }
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

function replyCustomerModeButtons(token) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages: [
      {
        type: "template",
        altText: "請選擇客服模式",
        template: {
          type: "buttons",
          title: "請問您希望接下來由誰為您服務？",
          text: "",
          actions: [
            { type: "message", label: "🤖 AI 回覆即可", text: "我希望由 AI 回覆" },
            { type: "message", label: "👩‍💼 真人客服接手", text: "我想要真人客服" }
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
