// Updated LINE Bot AI Flow - No Manual Mode Needed
// Features: AI auto-guided flow, budget collection, GPT answers, human handoff option

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

    console.log("使用者 ID:", userId);

    // 禁止字詞處理
    if (sensitiveKeywords.some(word => msg.includes(word))) {
      await replyText(event.replyToken, "⚠️ 為維護良好對話品質，請勿使用不當字詞喔。");
      continue;
    }

    // FAQ 回覆
    const faqKey = Object.keys(faqReplies).find(key => msg.toLowerCase().includes(key));
    if (faqKey) {
      await replyText(event.replyToken, faqReplies[faqKey]);
      continue;
    }

    const userdata = loadUserData();
    if (!userdata[userId]) {
      userdata[userId] = { step: 1 };
      saveUserData(userdata);
      await replyText(event.replyToken, "👋 歡迎洽詢報價！請問您的公司名稱是？");
      continue;
    }

    const user = userdata[userId];
    switch (user.step) {
      case 1:
        user.company = msg;
        user.step = 2;
        await replyText(event.replyToken, "請問您的產業類型是？");
        break;
      case 2:
        user.industry = msg;
        user.step = 3;
        await replyText(event.replyToken, "請問您的主要需求是？");
        break;
      case 3:
        user.need = msg;
        user.step = 4;
        await sendBudgetOptions(event.replyToken);
        break;
      case 4:
        user.budget = msg;
        user.step = 5;
        await replyText(event.replyToken, "請問方便與您聯繫的時間是？（例如：今天下午、明天早上）");
        break;
      case 5:
        user.time = msg;
        user.step = 6;
        saveUserData(userdata);

        await axios.post("https://notify-api.line.me/api/notify",
          new URLSearchParams({
            message: `🔔 新報價詢問：\n公司：${user.company}\n產業：${user.industry}\n需求：${user.need}\n預算：${user.budget}\n時間：${user.time}`
          }), {
            headers: {
              Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );

        await sendContactOptions(event.replyToken);
        break;
      default:
        // 如果有提問，使用 GPT 回覆
        try {
          const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "你是一位親切的繁體中文客服助理，請以繁體中文回答" },
              { role: "user", content: msg }
            ]
          }, {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          });

          const reply = response.data.choices[0].message.content;
          await replyText(event.replyToken, reply + "\n\n如需客製化影音服務，我們也可安排顧問與您進一步討論哦！");
        } catch (err) {
          console.error("GPT error:", err.response?.data || err.message);
          await replyText(event.replyToken, "目前服務繁忙，請稍後再試～");
        }
    }
    saveUserData(userdata);
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
        altText: "請選擇您的預算區間",
        template: {
          type: "buttons",
          title: "請問您的預算區間為？",
          text: "",
          actions: [
            { type: "message", label: "3-5 萬", text: "3-5 萬" },
            { type: "message", label: "5-10 萬", text: "5-10 萬" },
            { type: "message", label: "10 萬以上", text: "10 萬以上" }
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
        type: "template",
        altText: "請選擇聯絡方式",
        template: {
          type: "buttons",
          title: "我們可以安排顧問與您聯繫～",
          text: "請選擇希望的聯絡方式：",
          actions: [
            { type: "message", label: "LINE", text: "我想用 LINE 聯絡" },
            { type: "message", label: "電話", text: "我想電話聯絡" },
            { type: "message", label: "Email", text: "我想用 Email 聯絡" }
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
