# A+ Stock & Options Scanner - Railway Ready

This version keeps the original watchlist and adds:

NEE, ANET, PANW, NFLX, ABBV, SNOW, CRWD, NVO, HIMS, RGTI, NVTS, GLXY, TE, SOFI, TSLA, MSFT, SWKS, NVDA, AVGO, PLTR, IONQ, RKLB, QCOM, AMD, MU, ARM.

## What changed

- Website title no longer says 10 stocks. It now says stock watchlist.
- Entry-ready stocks are sorted to the top.
- Two charts were added:
  - Options chart
  - Stock swing chart
- Both charts show Alert 1, Alert 2, and Entry lines.
- Options rules added:
  - 5-minute candle close above 15-minute resistance and VWAP
  - 5-minute volume greater than 2x average of last 10 candles
  - MACD 8,17,9 bullish cross and green histogram
- Stock swing rules added:
  - Good high-volume day: price up, volume 3x average, close near high
  - Breakout retest
  - Volume base breakout
  - Trend + EMA dip
  - Avoid distribution volume, rejected highs, and extended/chasing setups

## Railway setup

1. Upload this project to GitHub.
2. Connect GitHub repo to Railway.
3. Add this Railway variable:

```bash
POLYGON_API_KEY=your_key_here
```

4. Deploy.

Educational use only. Not financial advice.
