// index.js
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const line = require("@line/bot-sdk");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;
const adminUserId = "U7411fd19912bc8f916d32106bc5940a3";

let manualMode = false;

const faqReplies = {
  "電話": "我們的電話是：0937-092-518",
  "聯絡方式": "我們的聯絡方式：電話 0937-092-518，Email：inchi.image@gmail.com",
  "email": "我們的 Email 是：inchi.image@gmail.com",
  "營業時間": "我們的營業時間是週一至週五 10:00-18:30",
  "地址": "我們地址是新北市板橋區光復街203號"
};

const sensitiveKeywords = ["幹", "媽的", "靠北", "他媽", "死"];

const logUserId = (event) => {
  console.log("User ID:", event.source.userId);
};

app.post("/webhook", async (req, res) => {
  res.status(200).send("OK");
  const events = req.body.events;
  for (let event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const message = event.message.text;

      logUserId(event); // 方便你抓其他使用者 ID

      // 控制客服模式開關
      if (userId === adminUserId) {
        if (message === "/manual on") {
          manualMode = true;
          await replyText(event.replyToken, "✅ 已切換至 *手動回覆模式*，Bot 暫停回覆。");
          return;
        } else if (message === "/manual off") {
          manualMode = false;
          await replyText(event.replyToken, "🤖 已切換至 *自動回覆模式*，Bot 開始工作囉！");
          return;
        }
      }

      // 如果手動模式開啟，非管理員就不回覆
      if (manualMode && userId !== adminUserId) return;

      // 關鍵字限制過濾
      if (sensitiveKeywords.some(word => message.includes(word))) {
        await replyText(event.replyToken, "⚠️ 為維護良好對話品質，請勿使用不當字詞喔。");
        return;
      }

      // 常見問答回覆
      const faqKey = Object.keys(faqReplies).find(key => message.includes(key));
      if (faqKey) {
        await replyText(event.replyToken, faqReplies[faqKey]);
        return;
      }

      // 自動引導報價表對話邏輯
      if (!fs.existsSync("userdata.json")) fs.writeFileSync("userdata.json", JSON.stringify({}));
      let userdata = JSON.parse(fs.readFileSync("userdata.json"));
      if (!userdata[userId]) {
        userdata[userId] = { step: 1 };
        fs.writeFileSync("userdata.json", JSON.stringify(userdata));
        await replyText(event.replyToken, "👋 歡迎洽詢報價！請問您的公司名稱是？");
        return;
      } else {
        const current = userdata[userId];
        if (current.step === 1) {
          current.company = message;
          current.step = 2;
          fs.writeFileSync("userdata.json", JSON.stringify(userdata));
          await replyText(event.replyToken, "請問您的產業類型是？");
          return;
        } else if (current.step === 2) {
          current.industry = message;
          current.step = 3;
          fs.writeFileSync("userdata.json", JSON.stringify(userdata));
          await replyText(event.replyToken, "請問您的主要需求是？");
          return;
        } else if (current.step === 3) {
          current.need = message;
          current.step = 4;
          fs.writeFileSync("userdata.json", JSON.stringify(userdata));

          // ✅ 傳送 LINE Notify 給管理員
          await axios.post("https://notify-api.line.me/api/notify",
            new URLSearchParams({
              message: `🔔 有新客戶填寫報價：\n公司：${current.company}\n產業：${current.industry}\n需求：${current.need}`
            }), {
              headers: {
                Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
                "Content-Type": "application/x-www-form-urlencoded"
              }
            }
          );

          // 最後一題：選擇聯絡方式
          await replyFlex(event.replyToken, {
            type: "flex",
            altText: "請選擇聯絡方式",
            contents: {
              type: "bubble",
              body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
                  {
                    type: "text",
                    text: "📅 我們可以為您安排與顧問進一步討論～\n請問您希望的聯繫方式是？",
                    wrap: true,
                    weight: "bold",
                    size: "md"
                  },
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
          });
          return;
        }
      }

      // 若沒有進入特殊條件，則進行 GPT 回覆
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

        const replyText = gptRes.data.choices[0].message.content;
        await replyText(event.replyToken, replyText);
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

function replyFlex(token, flex) {
  return axios.post("https://api.line.me/v2/bot/message/reply", flex, {
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
