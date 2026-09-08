# Fruit Factory

Telegram Mini App idle/clicker/economy MVP.

Includes Coins, Gems, Energy, production, selling, upgrades, automation-ready progression, daily rewards, prestige, leaderboard, Rewarded AdsGram adapter, Telegram authentication and basic admin statistics.

## Run
1. Copy `.env.example` to `.env`.
2. Set a NEW bot token, Mini App URL and AdsGram block ID.
3. `npm install`
4. `npm start`
5. Deploy the app over HTTPS and configure the Mini App URL in @BotFather.

The current MVP uses in-memory storage. For production/10k+ users, replace it with PostgreSQL/Prisma/Redis and persistent transactions/idempotency.
Do not commit `.env` or any bot token.