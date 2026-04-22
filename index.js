import express from 'express';
import pg from 'pg';
const { Pool } = pg;

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Auto-create users table on first run
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

// 1. Webhook verification for Meta
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

// 2. Handle WhatsApp messages
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

// 3. EduMe core logic
async function handleMessage(from, text) {
  let { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [from]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO users (phone) VALUES ($1)', [from]);
    rows = [{ phone: from, lang: 'phonetic' }];
  }
  const user = rows[0];

  // Language switch
  if (text === 'pidgin') {
