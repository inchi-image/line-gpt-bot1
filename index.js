
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();
const convo = require("./advanced-convo-engine");

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;
const adminUserId = process.env.ADMIN_USER_ID;

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
    const msg = event.message.text;

    if (msg === "/me") {
      await replyText(event.replyToken, `你的使用者 ID 是：\n${userId}`);
      return;
    }

    if (msg === "AI回覆") {
      convo.setMode(userId, "AI");
      await replyText(event.replyToken, "✅ 已切換為 AI 回覆模式。");
      return;
    }
    if (msg === "真人客服") {
      convo.setMode(userId, "human");
      setTimeout(() => convo.setMode(userId, "AI"), 3600000);
      await replyText(event.replyToken, "🧑‍💼 已切換為真人客服接手，我們會盡快與您聯繫。AI 回覆將暫停一小時。");
      return;
    }

    if (sensitiveKeywords.some(word => msg.includes(word))) {
      await replyText(event.replyToken, "⚠️ 為維護良好對話品質，請勿使用不當字詞喔。");
      return;
    }

    const faqKey = Object.keys(faqReplies).find(k => msg.includes(k));
    if (faqKey) {
      await replyText(event.replyToken, faqReplies[faqKey]);
      return;
    }

    const step = convo.getUserStep(userId);

    if (step === 0) {
      convo.updateUserStep(userId, "company", msg, 1);
      await replyText(event.replyToken, "請問您的產業類型是？");
      return;
    }
    if (step === 1) {
      convo.updateUserStep(userId, "industry", msg, 2);
      await replyText(event.replyToken, "請問您的主要需求是？");
      return;
    }
    if (step === 2) {
      convo.updateUserStep(userId, "need", msg, 3);
      await replyText(event.replyToken, "請選擇您的預算區間：\n1️⃣ 3-5萬\n2️⃣ 5-10萬\n3️⃣ 10萬以上");
      return;
    }
    if (step === 3) {
      convo.updateUserStep(userId, "budget", msg, 4);
      await replyText(event.replyToken, "請問方便聯絡的時間是？（可自由輸入）");
      return;
    }
    if (step === 4) {
      convo.updateUserStep(userId, "time", msg, 5);
      await replyFlex(event.replyToken, contactMethodFlex());
      return;
    }
    if (step === 5) {
      convo.updateUserStep(userId, "contact", msg, 6);
      const u = convo.getUserAll(userId);
      await axios.post("https://notify-api.line.me/api/notify",
        new URLSearchParams({
          message: `📩 有新客戶填寫完整資料：\n公司：${u.company}\n產業：${u.industry}\n需求：${u.need}\n預算：${u.budget}\n時間：${u.time}\n聯絡方式：${u.contact}`
        }), {
          headers: {
            Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      await replyFlex(event.replyToken, aiOrHumanChoice());
      convo.updateUserStep(userId, "final", "sent", 100);
      return;
    }

    if (convo.getMode(userId) === "human") return;

    if (step === -1 || step >= 100) {
      convo.updateUserStep(userId, "company", "", 0);
      await replyText(event.replyToken, "👋 歡迎洽詢報價！請問您的公司名稱是？");
      return;
    }

    try {
      const res = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "你是映啟影音行銷的智能客服，請用簡潔明確方式解答短影音與報價問題，並提醒可安排顧問一對一討論。" },
          { role: "user", content: msg }
        ]
      }, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const reply = res.data.choices[0].message.content;
      await replyText(event.replyToken, reply);
    } catch (e) {
      await replyText(event.replyToken, "目前客服繁忙，請稍後再試～");
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

function replyFlex(token, messages) {
  return axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: token,
    messages
  }, {
    headers: {
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
}

function contactMethodFlex() {
  return [
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
            { type: "text", text: "📞 請選擇聯絡方式：", weight: "bold", wrap: true },
            {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                { type: "button", style: "primary", action: { type: "message", label: "LINE", text: "LINE" } },
                { type: "button", style: "primary", action: { type: "message", label: "電話", text: "電話" } },
                { type: "button", style: "primary", action: { type: "message", label: "Email", text: "Email" } }
              ]
            }
          ]
        }
      }
    }
  ];
}

function aiOrHumanChoice() {
  return [
    {
      type: "template",
      altText: "是否轉真人客服",
      template: {
        type: "buttons",
        text: "請選擇後續服務方式：",
        actions: [
          { type: "message", label: "由 AI 繼續回覆", text: "AI回覆" },
          { type: "message", label: "真人客服接手", text: "真人客服" }
        ]
      }
    }
  ];
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 LINE GPT Bot 正在監聽 port ${PORT} 🚀`);
});
