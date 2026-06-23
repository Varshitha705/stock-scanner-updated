
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";

app.use(cors());
app.use(express.static("public"));

const WATCHLIST = [...new Set([
  "AAOI", "CELH", "LITE", "DIOD", "GNRC", "VSH", "POWI", "GEVG", "FRMI", "AXTI",
  "NEE", "ANET", "PANW", "NFLX", "ABBV", "SNOW", "CRWD", "NVO", "HIMS", "RGTI",
  "NVTS", "GLXY", "TE", "SOFI", "TSLA", "MSFT", "SWKS",
  "NVDA", "AVGO", "PLTR", "IONQ", "RKLB", "QCOM", "AMD", "MU", "ARM"
])];

const THEMES = {
  AAOI: { theme: "AI / Optical Infrastructure", benchmark: "SMH" },
  CELH: { theme: "Consumer Growth / Beverages", benchmark: "XLP" },
  LITE: { theme: "Optical / Data Center Infrastructure", benchmark: "SMH" },
  DIOD: { theme: "Semiconductors", benchmark: "SMH" },
  GNRC: { theme: "Power / Grid Infrastructure", benchmark: "XLI" },
  VSH:  { theme: "Electronic Components", benchmark: "SMH" },
  POWI: { theme: "Power Semiconductors", benchmark: "SMH" },
  GEVG: { theme: "User Watchlist Theme", benchmark: "SPY" },
  FRMI: { theme: "User Watchlist Theme", benchmark: "SPY" },
  AXTI: { theme: "Semiconductor Materials", benchmark: "SMH" },
  NEE: { theme: "Utilities / Clean Energy", benchmark: "XLU" },
  ANET: { theme: "AI Networking", benchmark: "SMH" },
  PANW: { theme: "Cybersecurity", benchmark: "HACK" },
  NFLX: { theme: "Streaming / Consumer Tech", benchmark: "QQQ" },
  ABBV: { theme: "Healthcare / Pharma", benchmark: "XLV" },
  SNOW: { theme: "Cloud Data", benchmark: "IGV" },
  CRWD: { theme: "Cybersecurity", benchmark: "HACK" },
  NVO: { theme: "Healthcare / Pharma", benchmark: "XLV" },
  HIMS: { theme: "Digital Health Growth", benchmark: "XLV" },
  RGTI: { theme: "Quantum Computing", benchmark: "QQQ" },
  NVTS: { theme: "Power Semiconductors", benchmark: "SMH" },
  GLXY: { theme: "Crypto / Digital Assets", benchmark: "BTC" },
  TE: { theme: "Energy / Industrials", benchmark: "XLE" },
  SOFI: { theme: "Fintech", benchmark: "XLF" },
  TSLA: { theme: "EV / Growth", benchmark: "QQQ" },
  MSFT: { theme: "AI / Mega-cap Software", benchmark: "QQQ" },
  SWKS: { theme: "Semiconductors", benchmark: "SMH" },
  NVDA: { theme: "AI Semiconductors", benchmark: "SMH" },
  AVGO: { theme: "AI Semiconductors / Infrastructure", benchmark: "SMH" },
  PLTR: { theme: "AI Software", benchmark: "IGV" },
  IONQ: { theme: "Quantum Computing", benchmark: "QQQ" },
  RKLB: { theme: "Space / Growth", benchmark: "XLI" },
  QCOM: { theme: "Semiconductors", benchmark: "SMH" },
  AMD: { theme: "AI Semiconductors", benchmark: "SMH" },
  MU: { theme: "Memory Semiconductors", benchmark: "SMH" },
  ARM: { theme: "Semiconductor IP", benchmark: "SMH" }
};

let cache = { key: "", time: 0, data: null };
const CACHE_MS = 60 * 1000;

function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); }
function round(v) { return v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100; }

async function polygon(path) {
  if (!POLYGON_API_KEY) throw new Error("Missing POLYGON_API_KEY. Add it in Railway Variables.");
  const separator = path.includes("?") ? "&" : "?";
  const url = `https://api.polygon.io${path}${separator}apiKey=${POLYGON_API_KEY}`;
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok || json.status === "ERROR") throw new Error(json.error || json.message || "Polygon request failed");
  return json;
}

async function aggregates(ticker, multiplier, timespan, from, to) {
  const path = `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
  const json = await polygon(path);
  return (json.results || []).map(c => ({
    date: new Date(c.t).toISOString(), open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v
  }));
}

function emaSeries(values, period) {
  if (!values || values.length < period) return [];
  const out = new Array(values.length).fill(null);
  const m = 2 / (period + 1);
  let cur = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = cur;
  for (let i = period; i < values.length; i++) { cur = values[i] * m + cur * (1 - m); out[i] = cur; }
  return out;
}
function ema(values, period) { const s = emaSeries(values, period); return s.length ? s.at(-1) : null; }
function sma(values, period) { if (!values || values.length < period) return null; return values.slice(-period).reduce((a,b)=>a+b,0)/period; }
function percentReturn(candles, barsBack) { if (!candles || candles.length <= barsBack) return null; const latest = candles.at(-1).close; const old = candles.at(-1 - barsBack).close; return old ? ((latest - old) / old) * 100 : null; }

function macd(closes, fast = 8, slow = 17, signal = 9) {
  if (!closes || closes.length < slow + signal + 2) return { line: null, signal: null, hist: null, crossUp: false, histGreen: false };
  const fastE = emaSeries(closes, fast), slowE = emaSeries(closes, slow);
  const macdLine = closes.map((_, i) => fastE[i] != null && slowE[i] != null ? fastE[i] - slowE[i] : null);
  const valid = macdLine.filter(v => v != null);
  const sigValid = emaSeries(valid, signal);
  const sigFull = new Array(macdLine.length).fill(null);
  let vi = 0;
  for (let i = 0; i < macdLine.length; i++) if (macdLine[i] != null) sigFull[i] = sigValid[vi++];
  const line = macdLine.at(-1), sig = sigFull.at(-1), prevLine = macdLine.at(-2), prevSig = sigFull.at(-2);
  return { line, signal: sig, hist: line != null && sig != null ? line - sig : null, crossUp: prevLine != null && prevSig != null && line > sig && prevLine <= prevSig, histGreen: line != null && sig != null && line - sig > 0 };
}

function vwap(candles) {
  let pv = 0, vol = 0;
  for (const c of candles) { const typical = (c.high + c.low + c.close) / 3; pv += typical * (c.volume || 0); vol += c.volume || 0; }
  return vol ? pv / vol : null;
}
function latestSession(candles) {
  if (!candles.length) return [];
  const day = candles.at(-1).date.slice(0,10);
  return candles.filter(c => c.date.slice(0,10) === day);
}
function calculatePOC(intraday, bins = 48) {
  const candles = intraday.filter(c => c.high && c.low && c.close && c.volume);
  if (candles.length < 30) return null;
  const min = Math.min(...candles.map(c => c.low)), max = Math.max(...candles.map(c => c.high));
  if (max <= min) return null;
  const step = (max - min) / bins, volumeBins = new Array(bins).fill(0);
  for (const c of candles) { let index = Math.floor((((c.high+c.low+c.close)/3)-min)/step); index = Math.max(0, Math.min(bins-1,index)); volumeBins[index] += c.volume || 0; }
  const i = volumeBins.indexOf(Math.max(...volumeBins)); return min + step * (i + 0.5);
}

function bullishTrend(daily) {
  if (!daily || daily.length < 60) return false;
  const closes = daily.map(c => c.close), last = closes.at(-1), sma20 = sma(closes,20), sma50 = sma(closes,50);
  const recent = daily.slice(-30), firstHalf = recent.slice(0,15), secondHalf = recent.slice(15);
  return last > sma20 && sma20 > sma50 && Math.max(...secondHalf.map(c=>c.high)) >= Math.max(...firstHalf.map(c=>c.high)) && Math.min(...secondHalf.map(c=>c.low)) >= Math.min(...firstHalf.map(c=>c.low));
}

function swingAnalysis(daily) {
  const closes = daily.map(c => c.close), highs = daily.map(c => c.high), lows = daily.map(c => c.low);
  const last = daily.at(-1), prev = daily.at(-2) || last;
  const avgVol20 = sma(daily.slice(0,-1).map(c => c.volume), 20) || sma(daily.map(c => c.volume), 20);
  const volumeRatio = avgVol20 ? last.volume / avgVol20 : null;
  const dayChange = prev.close ? ((last.close - prev.close) / prev.close) * 100 : null;
  const dayRange = last.high - last.low;
  const closeNearHigh = dayRange ? (last.close - last.low) / dayRange >= 0.75 : false;
  const strongVolumeDay = dayChange >= 3 && volumeRatio >= 3 && closeNearHigh;
  const distributionDay = dayChange <= 0 && volumeRatio >= 5;
  const resistance20 = Math.max(...highs.slice(-21, -1));
  const resistance50 = Math.max(...highs.slice(-51, -1));
  const lowVolPullback = daily.slice(-5).every(c => avgVol20 ? c.volume < avgVol20 * 0.9 : false);
  const breakoutRetest = last.close >= resistance20 * 0.97 && last.close <= resistance20 * 1.03 && lowVolPullback;
  const baseHigh = Math.max(...highs.slice(-31, -1)), baseLow = Math.min(...lows.slice(-31, -1));
  const baseTight = baseLow ? (baseHigh - baseLow) / baseLow < 0.18 : false;
  const volumeBaseBreakout = baseTight && last.close > baseHigh && volumeRatio >= 2;
  const ema21 = ema(closes, 21), ema50 = ema(closes, 50);
  const trendDipVolumeSpike = last.close > ema50 && Math.abs(last.low - ema21) / ema21 < 0.03 && dayChange > 0 && volumeRatio >= 1.5;
  const closeAboveWeekly50 = closes.length >= 250 ? last.close > sma(closes, 250) : last.close > ema50;
  const extended2w = daily.length > 10 ? ((last.close - daily.at(-11).close) / daily.at(-11).close) * 100 >= 30 : false;
  const rejectedATH = last.high >= Math.max(...highs.slice(0,-1)) * 0.99 && last.close < last.high * 0.96;
  const goodVolume = strongVolumeDay && !distributionDay && !extended2w && !rejectedATH;
  let setup = "Wait";
  if (volumeBaseBreakout) setup = "Volume Base Breakout";
  else if (breakoutRetest) setup = "Breakout Retest";
  else if (trendDipVolumeSpike) setup = "Trend + EMA Dip";
  else if (goodVolume) setup = "Good Volume Watch";
  else if (distributionDay) setup = "Avoid: Distribution Volume";
  else if (extended2w) setup = "Avoid: Extended / Chasing Risk";
  else if (rejectedATH) setup = "Avoid: Rejected at Highs";
  let score = 0;
  if (closeAboveWeekly50) score += 20;
  if (goodVolume) score += 25;
  if (breakoutRetest) score += 25;
  if (volumeBaseBreakout) score += 30;
  if (trendDipVolumeSpike) score += 25;
  if (distributionDay || extended2w || rejectedATH) score -= 30;
  score = Math.max(0, Math.min(100, score));
  const entry = Math.max(resistance20, last.close);
  return { avgVol20, volumeRatio, dayChange, closeNearHigh, strongVolumeDay, distributionDay, breakoutRetest, volumeBaseBreakout, trendDipVolumeSpike, closeAboveWeekly50, extended2w, rejectedATH, goodVolume, setup, score, levels: { entry: round(entry), alert2: round(entry * 0.995), alert1: round(entry * 0.99) } };
}

function optionsAnalysis(five, fifteen) {
  const session5 = latestSession(five);
  const session15 = latestSession(fifteen);
  const last5 = session5.at(-1) || five.at(-1);
  const closes5 = five.map(c => c.close);
  const avgVol10 = sma((session5.length ? session5 : five).slice(0,-1).map(c => c.volume), 10);
  const v = session5.length ? vwap(session5) : vwap(five.slice(-80));
  const m = macd(closes5, 8, 17, 9);
  const resistance15 = session15.length > 2 ? Math.max(...session15.slice(0,-1).map(c => c.high)) : (fifteen.length > 2 ? Math.max(...fifteen.slice(-20,-1).map(c => c.high)) : null);
  const entry = resistance15 || last5?.close || null;
  const volumeSpike2x = avgVol10 && last5 ? last5.volume > avgVol10 * 2 : false;
  const priceConfirm = last5 && entry && v ? last5.close > entry && last5.close > v : false;
  const momentumConfirm = m.crossUp && m.histGreen;
  const optionsReady = Boolean(priceConfirm && volumeSpike2x && momentumConfirm);
  return { avgVol10, vwap: round(v), macdLine: m.line, macdSignal: m.signal, macdHist: m.hist, macdCrossUp: m.crossUp, macdHistGreen: m.histGreen, priceConfirm, volumeSpike2x, optionsReady, levels: entry ? { entry: round(entry), alert2: round(entry * 0.995), alert1: round(entry * 0.99) } : { entry: null, alert2: null, alert1: null } };
}

function setupScore(checks, options, swing) {
  let score = 0;
  if (checks.trend) score += 15;
  if (checks.above9) score += 10;
  if (checks.above21) score += 10;
  if (checks.pocAbove) score += 10;
  if (checks.themeBullish) score += 10;
  if (options.optionsReady) score += 25;
  else { if (options.priceConfirm) score += 8; if (options.volumeSpike2x) score += 7; if (options.macdHistGreen) score += 5; }
  score += Math.round((swing.score || 0) * 0.20);
  score = Math.max(0, Math.min(100, score));
  let grade = "Pass"; if (score >= 90) grade = "A+"; else if (score >= 80) grade = "A"; else if (score >= 70) grade = "B";
  return { score, grade };
}

async function analyzeTicker(ticker) {
  const today = isoDate(new Date());
  const [daily, fifteen, five] = await Promise.all([
    aggregates(ticker, 1, "day", daysAgo(420), today),
    aggregates(ticker, 15, "minute", daysAgo(10), today),
    aggregates(ticker, 5, "minute", daysAgo(5), today)
  ]);
  if (!daily.length) throw new Error("No daily data returned. Check ticker or data subscription.");
  const closes = daily.map(c => c.close), price = closes.at(-1), ema9 = ema(closes,9), ema21 = ema(closes,21), ema50 = ema(closes,50), poc = calculatePOC(fifteen);
  const theme = THEMES[ticker] || { theme: "General Market", benchmark: "SPY" };
  let themeReturn1m = null, themeBullish = false;
  try { if (theme.benchmark !== "BTC") { const b = await aggregates(theme.benchmark, 1, "day", daysAgo(90), today); themeReturn1m = percentReturn(b,21); themeBullish = themeReturn1m != null && themeReturn1m > 0; } } catch(e) {}
  const checks = { trend: bullishTrend(daily), above9: price > ema9, above21: price > ema21, pocAbove: poc ? poc > price : false, themeBullish };
  const swing = swingAnalysis(daily);
  const options = optionsAnalysis(five, fifteen);
  const result = setupScore(checks, options, swing);
  return { ticker, price: round(price), changePercent: percentReturn(daily, 1), volume: daily.at(-1).volume, ema9: round(ema9), ema21: round(ema21), ema50: round(ema50), poc: round(poc), theme: theme.theme, benchmark: theme.benchmark, themeReturn1m, checks, options, swing, ...result,
    candles: daily.slice(-90).map(c => ({ date: c.date.slice(0,10), close: round(c.close), volume: c.volume })), updatedAt: new Date().toISOString() };
}

app.get("/api/health", (req, res) => res.json({ ok: true, hasPolygonKey: Boolean(POLYGON_API_KEY), watchlist: WATCHLIST }));

app.get("/api/analyze", async (req, res) => {
  const tickers = req.query.tickers ? req.query.tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 60) : WATCHLIST;
  if (!POLYGON_API_KEY) return res.status(400).json({ error: "Missing POLYGON_API_KEY. Add it in Railway Variables.", watchlist: tickers });
  const cacheKey = tickers.join(",");
  if (cache.data && cache.key === cacheKey && Date.now() - cache.time < CACHE_MS) return res.json({ data: cache.data, cached: true, updatedAt: new Date(cache.time).toISOString() });
  const results = await Promise.allSettled(tickers.map(analyzeTicker));
  let data = results.map((result, index) => result.status === "fulfilled" ? result.value : { ticker: tickers[index], error: result.reason?.message || "Could not analyze ticker." });
  data.sort((a,b) => {
    const ar = a.error ? -1 : (a.options?.optionsReady ? 1000 : 0) + (a.swing?.setup !== "Wait" && !a.swing?.setup?.startsWith("Avoid") ? 200 : 0) + (a.score || 0);
    const br = b.error ? -1 : (b.options?.optionsReady ? 1000 : 0) + (b.swing?.setup !== "Wait" && !b.swing?.setup?.startsWith("Avoid") ? 200 : 0) + (b.score || 0);
    return br - ar;
  });
  cache = { key: cacheKey, time: Date.now(), data };
  res.json({ data, cached: false, updatedAt: new Date().toISOString() });
});

app.get("*", (req, res) => res.sendFile(__dirname + "/public/index.html"));
app.listen(PORT, () => console.log(`A+ Stock Scanner running on port ${PORT}`));
