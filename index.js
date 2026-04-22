import express from 'express';
import pg from 'pg';
const { Pool } = pg;

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Auto-create table
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    phone VARCHAR(20) PRIMARY KEY,
    lang VARCHAR(10) DEFAULT 'phonetic',
    class VARCHAR(10),
    subject VARCHAR(50),
    last_topic VARCHAR(50),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`);

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            const from = message.from;
            const text = message.text?.body?.toLowerCase().trim();
            await handleMessage(from, text);
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

async function handleMessage(from, text) {
  let { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [from]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO users (phone) VALUES ($1)', [from]);
    rows = [{ phone: from, lang: 'phonetic' }];
  }
  const user = rows[0];

  if (text === 'pidgin') {
    await pool.query('UPDATE users SET lang = $1 WHERE phone = $2', ['pidgin', from]);
    return sendText(from, "No wahala. I don switch to Pidgin 🔊 Ask your Solar PV question.");
  }
  if (text === 'english') {
    await pool.query('UPDATE users SET lang = $1 WHERE phone = $2', ['phonetic', from]);
    return sendText(from, "Switched to Phonetic English. How can I help with Solar PV?");
  }

  if (text === 'trade') {
    await pool.query('UPDATE users SET subject = $1 WHERE phone = $2', ['solar_pv', from]);
    return sendText(from, `Solar PV ⚡ selected. This na NERDC trade subject. I go teach you theory, maths, and handwork.\n\nYou want:\n1. Basic: What is solar? Parts of system\n2. Maths: Calculate panel, battery, inverter size\n3. Practical: How to install step-by-step\n4. Safety: Rules for roof work\n5. Test me: WAEC/JAMB questions\n\nReply 1-5 or ask your question. Type 'pidgin' anytime to switch.`);
  }

  if (text.includes('1000w') && text.includes('5 hour')) {
    await sendSolarSizingStepByStep(from, user.lang);
    return;
  }

  if (text.includes('safety') || text === '4') {
    const msg = user.lang === 'pidgin' 
    ? `Safety first o. No go die for roof ⚠️\n\n3 main rules NERDC want:\n1. Wear rubber sole shoe + helmet. Roof fit dey slippery.\n2. Off all power before you touch wire. DC from panel fit shock.\n3. No work alone. Make person dey ground to help if you fall.\n\nYou want test question? Type 'test'.`
     : `Safety first. 3 NERDC rules:\n1. Wear rubber sole shoes + helmet. Roofs are slippery.\n2. Switch off all power before touching wires. DC can shock.\n3. Never work alone. Have someone on ground.\n\nType 'test' for practice question.`;
    return sendText(from, msg);
  }

  return sendText(from, `I be EduMe Solar PV tutor ⚡\n\nType 'trade' to start. Or ask: "1000W for 5 hours, how many panels?"\n\nType 'pidgin' to switch language.`);
}

async function sendSolarSizingStepByStep(from, lang) {
  const bubbles = lang === 'pidgin'? [
    `Good question 👍 Na system sizing be this. I go solve am step-by-step like WAEC.\n\n*Step 1: Find total energy you use per day*\nLoad = 1000W\nTime = 5 hours\nEnergy = Load x Time = 1000W x 5h = 5000 Watt-hour.\n\nSo you need 5000Wh every day. You follow?`,
    `*Step 2: Consider sun hours for Naija*\nWe no get sun 24 hours. For Ibadan/Lagos, we use average 4 peak sun hours per day.\n\nPanel Watt = Total Energy ÷ Sun Hours\nPanel Watt = 5000Wh ÷ 4h = 1250W.\n\nYou need panels wey fit give 1250W.`,
    `*Step 3: Calculate number of panels*\nIf one panel na 300W:\nNumber = 1250W ÷ 300W = 4.16\n\n*Answer: You need 5 panels.* We round up to 5 because you no fit buy 0.16 panel 😅`,
    `*WAEC Tip:* Always round up your panel number.\n\nYou want me solve for battery size next? Reply:\n1. Yes, battery size\n2. Test me\n3. Back to English`
  ] : [
    `Good question 👍 This is system sizing. I will solve step-by-step like WAEC.\n\n*Step 1: Find total energy per day*\nLoad = 1000W\nTime = 5 hours\nEnergy = Load x Time = 1000W x 5h = 5000 Watt-hour.\n\nSo you need 5000Wh every day. Clear?`,
    `*Step 2: Consider peak sun hours in Nigeria*\nWe use average 4 peak sun hours per day for Lagos/Ibadan.\n\nPanel Watt needed = Total Energy ÷ Sun Hours\nPanel Watt = 5000Wh ÷ 4h = 1250W.\n\nYou need panels that can give 1250W.`,
    `*Step 3: Calculate number of panels*\nIf one panel is 300W:\nNumber = 1250W ÷ 300W = 4.16\n\n*Answer: You need 5 panels.* We round up because you cannot buy 0.16 of a panel.`,
    `*WAEC Tip:* Always round up your panel number.\n\nDo you want me to solve for battery size next? Reply:\n1. Yes, battery size\n2. Test me\n3. Switch to Pidgin`
  ];

  for (let i = 0; i < bubbles.length; i++) {
    await sendText(from, bubbles[i]);
    if (i < bubbles.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
}

async function sendText(to, text) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    })
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EduMe running on ${PORT}`));
