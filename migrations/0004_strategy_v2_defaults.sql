-- Dollarino Strategy v2 Defaults Migration
-- Safely upgrades unmodified legacy 0003 KBOs v1 defaults (intRes=18, no EMA200/ADX filter, 2% trail)
-- to calibrated v2 defaults (intRes=4, basisLen=3, EMA200+ADX+DEMA_ATR aligned, 1.4/2.8/4.5 TP, 1.2% trail)

UPDATE bot_configs
SET
  kbos_params_json = '{"basisType":"ALMA","basisLen":3,"useRes":true,"intRes":4,"offsetSigma":5,"offsetALMA":0.85,"delayOffset":0,"tradeType":"BOTH","useAtr1":false,"useAtr2":false,"useVol":false,"useEmaRsi":false,"useEma200":true,"useAdx":true,"adxVariant":"ORIGINAL","adxThreshold":18,"useRsiCustom":false,"useBb":false,"useDemaAtr":true,"haCandles":true,"periodDema":7,"periodAtr":14,"factorAtr":1.5,"tp1Pct":1.4,"tp2Pct":2.8,"tp3Pct":4.5,"useTrail":true,"trailPct":1.2,"trailAfterTp1":true,"beAfterTp1":true,"mainRibbonLen":180}',
  trailing_stop_pct = 1.2,
  updated_at = datetime('now')
WHERE kbos_params_json LIKE '%"intRes":18%'
  AND kbos_params_json LIKE '%"useEma200":false%'
  AND kbos_params_json LIKE '%"useAdx":false%';
