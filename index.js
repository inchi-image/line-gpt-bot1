const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;

let manualMode = false; // true 表示手動回覆中
const adminUserId = "U7411fd19912bc8f916d32106bc5940a3";

const forbiddenKeywords = ["幹", "三小", "你媽", "操", "智障"];
const userStates = {};

app.post("/webhook", async (req, res) => {
  res.status(200).send("OK");

  const events = req.body.events;
  for (let event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const userText = event.message.text.trim();
      console.log("👤 使用者 ID:", userId);

      if (forbiddenKeywords.some(word => userText.includes(word))) {
        await reply(event.replyToken, "⚠️ 為維護良好對話品質，請避免使用不當字詞唷。");
        continue;
      }

      if (userId === adminUserId) {
        if (userText === "/manual on") {
          manualMode = true;
          await reply(event.replyToken, "✅ 手動模式已開啟，Bot 暫停自動回覆。");
          continue;
        }
        if (userText === "/manual off") {
          manualMode = false;
          await reply(event.replyToken, "✅ 手動模式已關閉，Bot 恢復自動回覆。");
          continue;
        }
      }

      if (["/manual on", "/manual off"].includes(userText) && userId !== adminUserId) {
        await reply(event.replyToken, "⚠️ 此指令僅限客服人員使用。請留言我們會儘快回覆您！");
        continue;
      }

      if (manualMode) {
        await reply(event.replyToken, "👩‍💼 目前由專人協助中，請稍候喔～");
        continue;
      }

      if (["聯絡方式", "電話", "email", "聯繫"].some(k => userText.includes(k))) {
        await reply(event.replyToken, `📞 聯絡方式如下：\n電話：0937-092-518\nEmail：inchi.image@gmail.com\n營業時間：週一至週五 10:00-18:30\n地址：新北市板橋區光復街203號`);
        continue;
      }

      if (!userStates[userId]) {
        userStates[userId] = { step: 1, data: {} };
        await reply(event.replyToken, "👋 歡迎洽詢報價！請問您的公司名稱是？");
        continue;
      }

      const state = userStates[userId];
      if (state.step === 1) {
        state.data.company = userText;
        state.step++;
        await reply(event.replyToken, "您主要的產業或服務是？");
      } else if (state.step === 2) {
        state.data.industry = userText;
        state.step++;
        await reply(event.replyToken, "請簡述您希望我們協助的需求或內容 🙋‍♀️");
      } else if (state.step === 3) {
        state.data.need = userText;
        state.step++;
        await reply(event.replyToken, "📅 我們可以為您安排與顧問進一步討論～請問您希望的聯繫方式是？\n1️⃣ LINE\n2️⃣ 電話\n3️⃣ Email\n4️⃣ 不用聯繫，我先看看就好");
      } else if (state.step === 4) {
        state.data.contactMethod = userText;
        await reply(event.replyToken, "✅ 感謝填寫，我們會盡快與您聯繫！若您還有其他問題，歡迎隨時留言～");

        await axios.post("https://notify-api.line.me/api/notify", new URLSearchParams({
          message: `📬 新報價表單來囉！\n公司：${state.data.company}\n產業：${state.data.industry}\n需求：${state.data.need}\n聯繫方式：${state.data.contactMethod}`
        }), {
          headers: {
            Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        });

        delete userStates[userId];
      }
    }
  }
});

async function reply(replyToken, text) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [{ type: "text", text }]
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("❌ LINE 回覆錯誤：", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 LINE GPT Bot 正在監聽 port ${PORT} 🚀`);
});
