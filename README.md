# Empire Logic — Telegram Mini App MVP

A safe starter Telegram Mini App with a logic game, coins, XP, daily reward and AdsGram rewarded-ad adapter.

## Setup
1. Create a bot with @BotFather and keep the token private.
2. Copy `.env.example` to `.env`.
3. Put your NEW bot token into `BOT_TOKEN`.
4. Put your deployed Mini App URL into `WEBAPP_URL`.
5. Put your AdsGram Rewarded `BLOCK_ID` into `ADSGRAM_BLOCK_ID`.
6. Run `npm install`.
7. Run `npm start`.

The Mini App must be served over HTTPS for production. Configure the bot's Mini App URL in @BotFather.

AdsGram is intentionally configured with a block ID placeholder. The SDK is loaded in the web app and a reward is granted only after the rewarded promise resolves. See official AdsGram docs for current requirements.