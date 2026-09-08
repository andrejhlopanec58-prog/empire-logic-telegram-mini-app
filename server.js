import "dotenv/config";
import express from "express";
import crypto from "crypto";
import {Telegraf,Markup} from "telegraf";
import path from "path";
import {fileURLToPath} from "url";

const app=express(); app.use(express.json());
const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000), TOKEN=process.env.BOT_TOKEN, URL=process.env.WEBAPP_URL;
if(!TOKEN||!URL){console.error("Set BOT_TOKEN and WEBAPP_URL in .env");process.exit(1)}

const C={cap:100,regen:15000,base:10,sell:2,upgrade:50,growth:1.22,adLimit:8};
const users=new Map(), rewards=new Set(), events=[];
const today=()=>new Date().toISOString().slice(0,10);
function get(id,name="Player"){
 if(!users.has(id)) users.set(id,{id,name,coins:100,gems:5,energy:100,xp:0,level:1,upgrade:0,factory:1,prestige:0,produced:0,sold:0,lastSeen:Date.now(),daily:"",streak:0,adDay:today(),ads:0});
 const u=users.get(id); const e=Date.now()-u.lastSeen; u.energy=Math.min(C.cap,u.energy+Math.floor(e/C.regen));u.lastSeen=Date.now();return u;
}
function need(u){return 100+u.level*75}
function xp(u,n){u.xp+=n;while(u.xp>=need(u)){u.xp-=need(u);u.level++}}
function cost(u){return Math.floor(C.upgrade*Math.pow(C.growth,u.upgrade))}
function value(u){return Math.floor(C.base*(1+u.upgrade*.15)*(1+u.prestige*.1))}
function pub(u){return {id:u.id,name:u.name,coins:Math.floor(u.coins),gems:u.gems,energy:u.energy,xp:u.xp,xpNeed:need(u),level:u.level,upgrade:u.upgrade,factory:u.factory,prestige:u.prestige,produced:u.produced,upgradeCost:cost(u),adsToday:u.ads}}
function log(type,id,meta={}){events.push({type,id,at:Date.now(),meta});if(events.length>5000)events.shift()}
function validate(initData){
 const p=new URLSearchParams(initData||""),hash=p.get("hash");if(!hash)return null;p.delete("hash");
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
 const secret=crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();
 const calc=crypto.createHmac("sha256",secret).update(check).digest("hex");
 if(hash.length!==calc.length||!crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(calc)))return null;
 const auth=Number(p.get("auth_date"));if(!auth||Date.now()/1000-auth>86400)return null;
 return JSON.parse(p.get("user")||"null");
}
function auth(req,res){try{const t=validate(req.body.initData);if(!t){res.status(401).json({error:"Invalid Telegram session"});return null}return get(t.id,t.first_name||"Player")}catch{res.status(400).json({error:"Bad request"});return null}}

app.get("/api/config",(_,r)=>r.json({adsgramBlockId:process.env.ADSGRAM_BLOCK_ID||""}));
app.post("/api/auth",(q,r)=>{const u=auth(q,r);if(u){log("game_start",u.id);r.json(pub(u))}});
app.post("/api/collect",(q,r)=>{const u=auth(q,r);if(!u)return;if(u.energy<1)return r.status(400).json({error:"Not enough Energy"});u.energy--;u.produced++;xp(u,2);r.json({reward:1,user:pub(u)})});
app.post("/api/produce",(q,r)=>{const u=auth(q,r);if(!u)return;if(u.energy<3)return r.status(400).json({error:"Not enough Energy"});u.energy-=3;let n=value(u);u.coins+=n;u.produced+=n;xp(u,n);log("production",u.id,{n});r.json({reward:n,user:pub(u)})});
app.post("/api/sell",(q,r)=>{const u=auth(q,r);if(!u)return;if(u.produced<=0)return r.status(400).json({error:"Nothing to sell"});let n=Math.min(100,u.produced),rew=n*C.sell;u.produced-=n;u.coins+=rew;u.sold+=n;xp(u,Math.ceil(rew/2));r.json({reward:rew,user:pub(u)})});
app.post("/api/upgrade",(q,r)=>{const u=auth(q,r);if(!u)return;let c=cost(u);if(u.coins<c)return r.status(400).json({error:"Not enough Coins"});u.coins-=c;u.upgrade++;u.factory=Math.floor(u.upgrade/5)+1;xp(u,20);log("upgrade",u.id,{c});r.json({reward:0,user:pub(u)})});
app.post("/api/daily",(q,r)=>{const u=auth(q,r);if(!u)return;let d=today();if(u.daily===d)return r.status(400).json({error:"Already claimed"});let y=new Date(Date.now()-86400000).toISOString().slice(0,10);u.streak=u.daily===y?Math.min(7,u.streak+1):1;u.daily=d;let rew=100+u.streak*50;u.coins+=rew;if(u.streak===7)u.gems+=3;xp(u,25);log("daily_reward",u.id,{rew});r.json({reward:rew,user:pub(u)})});
app.post("/api/ad/reward",(q,r)=>{const u=auth(q,r);if(!u)return;if(u.adDay!==today()){u.adDay=today();u.ads=0}let k=u.id+":"+String(q.body.idempotencyKey||"");if(rewards.has(k))return r.status(409).json({error:"Reward already processed"});if(u.ads>=C.adLimit)return r.status(429).json({error:"Daily ad limit reached"});rewards.add(k);u.ads++;u.coins+=50;xp(u,5);log("ad_completed",u.id);r.json({reward:50,user:pub(u)})});
app.post("/api/prestige",(q,r)=>{const u=auth(q,r);if(!u)return;if(u.level<10)return r.status(400).json({error:"Reach level 10 first"});u.prestige++;u.level=1;u.xp=0;u.upgrade=0;u.factory=1;u.coins=100;u.produced=0;log("prestige",u.id);r.json({user:pub(u)})});
app.get("/api/leaderboard",(_,r)=>r.json([...users.values()].sort((a,b)=>b.coins-a.coins).slice(0,20).map((u,i)=>({rank:i+1,name:u.name,coins:Math.floor(u.coins),level:u.level}))));
app.get("/api/admin/stats",(q,r)=>{let ids=String(process.env.ADMIN_TELEGRAM_IDS||"").split(",").map(x=>x.trim());let t=validate(q.query.initData);if(!t||!ids.includes(String(t.id)))return r.status(403).json({error:"Forbidden"});r.json({players:users.size,dau:[...users.values()].filter(u=>Date.now()-u.lastSeen<86400000).length,adsCompleted:events.filter(e=>e.type==="ad_completed").length})});
app.use(express.static(path.join(root,"../web")));

const bot=new Telegraf(TOKEN);
const play=()=>Markup.inlineKeyboard([[Markup.button.webApp("🏭 PLAY",URL)]]);
bot.start(c=>c.reply("🍎 Добро пожаловать в Fruit Factory!",play()));
bot.command("game",c=>c.reply("Открывай фабрику:",play()));
bot.command("profile",c=>{let u=get(c.from.id,c.from.first_name);c.reply(`👤 ${u.name}\n💰 ${u.coins} Coins\n💎 ${u.gems} Gems\n⭐ Level ${u.level}`)});
bot.command("bonus",c=>c.reply("🎁 Ежедневный бонус находится внутри игры."));
bot.command("top",c=>c.reply("🏆 Рейтинг находится внутри игры."));
bot.command("help",c=>c.reply("🍎 Собирай → производи → продавай → улучшай фабрику. Реклама добровольная."));
bot.launch();app.listen(PORT,()=>console.log("Fruit Factory on "+PORT));