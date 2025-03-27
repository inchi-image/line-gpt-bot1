const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ✅ 預先回 200，避免 webhook timeout（防封鎖關鍵）
app.post("/webhook", (req, res) => {
  res.status(200).send("OK");

  const events = req.body.events;
  events.forEach((event) => {
    if (event.type === "message" && event.message.type === "text") {
      handleMessage(event);
    }
  });
});

// ✅ 將 GPT 處理拉出來獨立 async function
async function handleMessage(event) {
  const userText = event.message.text;

  try {
    // GPT prompt 設定（真人客服風格）
    const gptResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        max_tokens: 300, // 防暴衝過多 token
        messages: [
          {
            role: "system",
            content:
              "你是短影音公司的熱情客服專員，口吻自然親切、具專業度。請根據客戶輸入的問題，簡單說明服務內容，並主動邀約預約免費諮詢。請用繁體中文回答，並保持有禮貌像真人客服。"
          },
          { role: "user", content: userText }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const replyText = gptResponse.data.choices[0].message.content.trim();

    // 回傳訊息給 LINE 使用者
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: event.replyToken,
        messages: [{ type: "text", text: replyText }]
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("❌ GPT or LINE 回覆錯誤：", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌈 LINE GPT Bot 正在監聽 port ${PORT} 🚀`);
});
