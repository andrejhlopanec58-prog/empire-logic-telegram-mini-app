import 'dotenv/config';
import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const WEBAPP_URL = process.env.WEBAPP_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Set BOT_TOKEN and WEBAPP_URL in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Demo MVP storage. Replace with PostgreSQL/Prisma before large-scale production.
const users = new Map();

function getUser(id, name='Player') {
  if (!users.has(id)) {
    users.set(id, {
      id, name, coins: 100, xp: 0, level: 1,
      dailyClaimedAt: 0, adsToday: 0, adDay: new Date().toISOString().slice(0,10),
      games: 0
    });
  }
  const u = users.get(id);
  const day = new Date().toISOString().slice(0,10);
  if (u.adDay !== day) { u.adDay = day; u.adsToday = 0; }
  return u;
}

function addCoins(u, amount, reason) {
  u.coins += amount;
  u.xp += Math.max(1, Math.floor(amount / 5));
  while (u.xp >= u.level * 100) {
    u.xp -= u.level * 100;
    u.level++;
  }
  return { amount, reason };
}

// Telegram initData validation. Never trust user identity from plain client JSON.
function validateInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculated = crypto.createHmac('sha256', secret)
    .update(dataCheck)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now()/1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  return userRaw ? JSON.parse(userRaw) : null;
}

app.get('/api/config', (_, res) => {
  res.json({ adsgramBlockId: process.env.ADSGRAM_BLOCK_ID || '' });
});

app.post('/api/auth', (req,res) => {
  try {
    const tg = validateInitData(req.body.initData || '', BOT_TOKEN);
    if (!tg) return res.status(401).json({ error: 'Invalid Telegram session' });
    const u = getUser(tg.id, tg.first_name || 'Player');
    res.json(publicUser(u));
  } catch {
    res.status(400).json({ error: 'Bad initData' });
  }
});

app.post('/api/game/finish', (req,res) => {
  try {
    const tg = validateInitData(req.body.initData || '', BOT_TOKEN);
    if (!tg) return res.status(401).json({ error: 'Invalid session' });
    const u = getUser(tg.id, tg.first_name || 'Player');
    const answer = Number(req.body.answer);
    const correct = answer === Number(req.body.expected);
    u.games++;
    const reward = correct ? 25 : 5;
    addCoins(u, reward, 'logic_game');
    res.json({ correct, reward, user: publicUser(u) });
  } catch {
    res.status(400).json({ error: 'Bad request' });
  }
});

app.post('/api/daily/claim', (req,res) => {
  try {
    const tg = validateInitData(req.body.initData || '', BOT_TOKEN);
    if (!tg) return res.status(401).json({ error: 'Invalid session' });
    const u = getUser(tg.id, tg.first_name || 'Player');
    const now = Date.now();
    if (now - u.dailyClaimedAt < 20*60*60*1000)
      return res.status(429).json({ error: 'Daily reward already claimed' });
    u.dailyClaimedAt = now;
    addCoins(u, 100, 'daily');
    res.json({ reward: 100, user: publicUser(u) });
  } catch {
    res.status(400).json({ error: 'Bad request' });
  }
});

// MVP ad endpoint: the browser only requests a server reward after AdsGram confirms completion.
// In production, add persistent idempotency records and any verification mechanism provided by AdsGram.
app.post('/api/ad/reward', (req,res) => {
  try {
    const tg = validateInitData(req.body.initData || '', BOT_TOKEN);
    if (!tg) return res.status(401).json({ error: 'Invalid session' });
    const u = getUser(tg.id, tg.first_name || 'Player');
    if (u.adsToday >= 10) return res.status(429).json({ error: 'Daily ad limit reached' });
    u.adsToday++;
    addCoins(u, 50, 'rewarded_ad');
    res.json({ reward: 50, user: publicUser(u) });
  } catch {
    res.status(400).json({ error: 'Bad request' });
  }
});

function publicUser(u) {
  return { id:u.id, name:u.name, coins:u.coins, xp:u.xp, level:u.level, games:u.games, adsToday:u.adsToday };
}

app.use(express.static(path.join(__dirname, 'web')));

bot.start((ctx) => ctx.reply(
  '🎮 Empire Logic — мини-игра',
  Markup.inlineKeyboard([[Markup.button.webApp('🎮 Играть', WEBAPP_URL)]])
));
bot.command('game', (ctx) => ctx.reply('Открывай игру:', Markup.inlineKeyboard([[Markup.button.webApp('🎮 Играть', WEBAPP_URL)]])));
bot.command('help', (ctx) => ctx.reply('🎮 Решай задачи, получай Coins, прокачивай уровень и используй добровольные Rewarded Ads для бонусов.'));

bot.launch().then(() => console.log('Bot started'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => console.log(`Web server on :${PORT}`));