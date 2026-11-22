# Changelog

## [9.9.2] - 2026-11-22
### Added & Improved
- **Screenshot & Receipt Image Support End-to-End (Web, Admin & Telegram Bot + D1 Migration `0025`)**:
  - Added `support_messages.image_data_url` and `user_subscriptions.receipt_image_url` (`migrations/0025_v992_receipt_and_support_images.sql`).
  - Upgraded `SupportModal.tsx`, `routes/support.ts`, and Telegram `AWAIT_SUPPORT_MSG` so users can attach, paste (`Ctrl+V`), or send screenshots in Telegram and Web; AI Vision analyzes uploaded screenshots automatically, and human support relays photos directly to all Telegram admins via `sendPhoto` (`notifyAllAdminsPhoto`) + displays them inside `AdminPage.tsx` with full-screen lightbox preview.
  - Redesigned `SubscriptionPage.tsx` into a clear 3-step checkout flow with compressed `receiptImageDataUrl` upload (making TXID optional when a payment receipt photo is uploaded), instant auto-scroll to checkout, order receipt lightbox, and admin photo relay (`sub_verify:` / `POST /api/subscriptions/checkout`).
- **Central AI & DeepSeek / Hilinkup Gateway Normalization + Failover (`ai/providers.ts`, `ai/assistant.ts`, `routes/admin.ts`)**:
  - Automatically normalizes legacy/alias model names (`deep`, `deepseek`, `دیپی`, `deepseek-v4`) on `hilinkup.com` and DeepSeek endpoints to `baidu/deepseek-v4.1-flash-1017` / `deepseek-chat`, with automatic multi-model failover retry and explicit `hilinkupSecretConfigured` status visibility in `AdminPage.tsx`.
- **Logo-Inspired Floating AI Robot Orb & Unified Mobile Chat UX (`FloatingAiChat.tsx`, `Layout.tsx`, `LandingPage.tsx`)**:
  - Replaced the plain orb with a bespoke `DollarinoRobotLogoIcon` SVG inspired by `public/logo.png` (cosmic astronaut-bot with ascending jade candles), added a responsive mobile full-width bottom-sheet (`84dvh`), unified rounded-pill composer bars with safe-area padding, and decluttered mobile headers.
- **Mobile 60fps Performance, Lazy Routing & Dynamic Open Graph (`App.tsx`, `index.css`, `index.html`, `sw.js`, `worker/index.ts`)**:
  - Added `React.lazy` + `<Suspense>` code splitting across 14 secondary pages, disabled heavy `.panel` `backdrop-filter` below `1024px` for smooth mobile scrolling, moved OG meta tags to early `<head>` (`?v=992`) with server-side origin rewriting (`serveAssetsWithDynamicOg`), and bumped PWA cache to `dollarino-pwa-v9.9.2`.

## [9.9.1] - 2026-11-22
### Fixed & Improved
- **Mobile UI Cleanup — Removed Background Halos (`apps/web/src/index.css`, `LandingPage.tsx`, `BrandGraphics.tsx`)**:
  - Removed multi-spot radial gradient color halos (`--bg-art`) and `background-attachment: fixed` that rendered blotchy mobile backdrop artifacts, removed the `blur-[130px]` hero halo in `LandingPage.tsx`, toned down `.glow-card-anim` and mobile tab indicator bloom, and softened logo drop-shadows.
- **iPhone AssistiveTouch-Style Collapsible Floating AI Orb (`apps/web/src/components/FloatingAiChat.tsx`)**:
  - Replaced the oversized capsule button with a subtle, compact `44×44` circular glass orb modeled after iOS AssistiveTouch with concentric white rings, free pointer drag-to-move with left/right edge snapping, persistent position (`localStorage`), and automatic soft edge-collapse (`opacity: 0.48`, tucked half off-edge after 2.4s idle) so it stays unobtrusive on mobile and desktop.
- **Always-On Zero-Downtime AI Chat & Guest Support (`apps/worker/src/ai/assistant.ts`, `index.ts`, `env.ts`, `FloatingAiChat.tsx`)**:
  - Added public rate-limited `/api/public/ai-models` and `/api/public/ai-chat` endpoints so the floating AI orb opens an active chat immediately even before login.
  - Added seamless multi-model auto-failover across admin `platform_ai_engines`, `HILINKUP_API_KEY`, personal `ai_connections`, optional Cloudflare `env.AI`, and a zero-downtime built-in live market AI (`dollarino-live-ai`) that pulls real-time prices/candles and computes Entry/SL/TP1–TP3 setups, position sizing, Pine Script strategies, and platform/creator answers whenever external LLM gateways are unconfigured or unreachable.
- **Branded Open Graph & Social Link Preview (`apps/web/public/images/dollarino-og-brand.jpg`, `index.html`, `_headers`)**:
  - Created and optimized a `1200×630` Progressive JPEG (`114 KB`) featuring the official Dollarino logo (`logo.png`) alongside cache-busted Open Graph/Twitter meta tags and Cloudflare Pages `_headers` for crisp Telegram & Instagram DM previews.

## [9.9.0] - 2026-11-22
### Added
- **Floating AI Assistant & Dedicated Multi-Model Chat Page (`apps/web/src/components/FloatingAiChat.tsx`, `AiChatPage.tsx`, `apps/worker/src/ai/assistant.ts`, `routes/ai-assistant.ts`)**:
  - Added an always-accessible **Floating AI Chat Widget** across landing, auth, and workspace pages, plus a full-screen **Dedicated AI Chat & Vision Page** (`?tab=aichat`) with saved conversation sessions.
  - Added live **AI Model Selector** listing all connected platform engines (admin-configured OpenAI, Anthropic, Gemini, DeepSeek, Hilinkup) and user BYOAI keys, persisting per-user preference across Web and Telegram.
  - Added **Chart Image Upload / Drag & Drop / Clipboard Paste (`Ctrl+V`)** with client-side JPEG compression and full **Multimodal Vision Analysis** (OpenAI/GPT-4o, Claude, Gemini, OpenAI-compatible Vision gateways) that automatically extracts structured **Entry / Stop Loss / TP1–TP3 / R:R Trading Setups**.
- **Full Telegram Bot AI Chat, Model Switcher & Chart Image Analysis (`apps/worker/src/telegram/handler.ts`, `client.ts`, `formatter.ts`)**:
  - Added `/ai`, `/chat`, and `🧠 چت هوش مصنوعی (عکس چارت)` button, inline model switcher (`tg_ai_models`), new session control, direct Telegram photo/document image download & chart Vision analysis, 1-click conversion of extracted chart setups into Dollarino signals (`tg_ai_exec_setup`), and conversational AI fallback.
- **Project Creator Attribution (`Avid Kiya / آوید کیا`)**:
  - Credited creator **آوید کیا (Avid Kiya)** with official handles (**Telegram: `@avidkiya`**, **Instagram & X: `@avid_kiya`**) in Dedicated AI system memory, Web Landing/Dashboard/FAQ footers, `/api/public/creator`, and Telegram `/start`, `/help`, and `/about`.
- **Database Migration (`migrations/0024_v99_ai_chat_vision_creator.sql`)**:
  - Added `users.preferred_ai_model_id`, `ai_chat_sessions`, and `ai_chat_messages`.

## [9.8.1] - 2026-11-22
### Added & Improved
- **Rich Telegram & Social Link Preview (`apps/web/index.html`, `og-preview.jpg`)**:
  - Generated bespoke `1200×630` Open Graph preview artwork (`/images/og-preview.jpg`, `209 KB`) and added full `og:title`, `og:description`, `og:image`, `og:site_name`, and `twitter:card` (`summary_large_image`) meta tags so sharing `https://dollarino.pages.dev/` in Telegram displays a crisp banner image and polished Persian description.
- **Always-On 24/7 AI Signal Radar & Channel/Bot Intel Publisher (`apps/worker/src/engine/market-intel.ts`, `publisher.ts`, `index.ts`, `admin-menu.ts`)**:
  - Added `runAlwaysOnSignalRadar` to Cloudflare Cron (`* * * * *`): continuously scans markets via Dorna V1, KBOS v11, and Central AI and broadcasts verified signals to both `@Dollarino_official` and verified bot users **even when users' auto-trading bots are STOPPED**.
  - Added `runAlwaysOnAiIntel`: automatically publishes AI-generated **Market Analysis** (every 4h), **Crypto News Summaries** (every 6h), **Volatility / RSI Risk Alerts** (threshold-based + 2h cooldown), and **Platform Feature Spotlights / Promos** with brand banners (every 8h) to both the Telegram channel and bot users, with instant 1-tap triggers & toggles in the Telegram Admin Channel panel (`adm:channel`).

## [9.8.0] - 2026-11-21
### Added & Improved
- **Visual Banners, Brand Logos & Exchange Integrations (`Toobit`, `Bitunix`, `KCEX`, `Paper`)**:
  - Generated 4 high-resolution visual banners (`support-concierge.png`, `exchange-api-hub.png`, `my-ai-brain.png`, `vip-club-banner.png`) optimized for fast web/mobile delivery, plus `BrandLogos.tsx` (`ExchangeLogo`, `WalletLogo`, `ChainLogo`) covering exchanges, wallets, and 16+ blockchains.
  - Enabled `Bitunix Futures` across Worker (`bitunix.ts` with `getPositions()`, `connections.ts`, `trading.ts`, Telegram `handler.ts`/`formatter.ts`) and Web (`CopyConnectPage.tsx`, `SetupWizardModal.tsx`, `LandingPage.tsx`, `SubscriptionPage.tsx`, `ServicesPage.tsx`), and made `KCEX` Signal-Mirror keys optional (passwordless activation).
- **Redesigned Online Support (`SupportModal.tsx`)**:
  - Upgraded header with `support-concierge.png`, live online pulse badge, smooth sliding AI vs. Human segmented switcher, 4 quick-topic cards, and animated typing indicator.
- **Dual Telegram Mini App + Google/Browser PWA Login (`handler.ts`, `auth.ts`, `App.tsx`, `PwaInstallModal.tsx`)**:
  - Updated `sendWebMagicLoginLink` to include both a Telegram `web_app` Mini App button and a Google/Browser button (`&install=1`), backed by a 10-minute reusable `web_magic_token` and automatic `PwaInstallModal` trigger.
- **Multi-Chain Wallet Connect & All-Network DEX Radar (`migrations/0023_v98_multichain_wallets.sql`, `trustwallet.ts`, `screener.ts`, `DexTrustPage.tsx`)**:
  - Added `trust_wallet_ton` D1 column, multi-chain injected discovery (`connectAllWalletChains` for EVM + Solana + TRON + TON), 1-click EVM network switching (Ethereum, BSC, Base, Arbitrum, Polygon, Optimism, Avalanche), live 9-network on-chain balance querying, and parallel DexScreener + GeckoTerminal pair discovery across 17+ chains.
- **Service Worker (`sw.js`) & Full Audit Fixes**:
  - Updated cache version to `dollarino-pwa-v9.8`, fixed `bitunix.ts` `markPrice` typing, synced `trust_wallet_ton` across `support.ts`, `admin.ts`, and `admin-menu.ts`, and added end-to-end Miniflare tests in `telegram-bot.test.ts`.

## [7.1.0] - 2026-11-20
### Added
- `migrations/0012_telegram_bot_admin_suite.sql`: Added `wallet_balance_usdt`, `admin_panel_last_active_at`, `web_magic_token`, `web_magic_expires_at` on `users`, `code_type` / `credit_usdt` on `gift_codes`, and bot system defaults (`bot_help_text`, `bot_help_media_url`, `bot_private_admin_only`, `signal_channel_handle`, `default_margin_pct`, `default_max_leverage`, `usdt_to_toman_rate`).
- **Full Telegram Bot (`@Dollarino_bot`) & Channel (`@Dollarino_official` / `-1002263982097`) Specification**:
  - Updated Persian welcome (`سلام خوش اومدی {name} 🌹`), main keyboard (`اتصال به صرافی 🔗`, `تنظیمات ⚙️`, `حساب کاربری 👤`, `خرید اشتراک 💎`, `راهنما 📚`, Mini App), and full inline **Toobit & KCEX** API Key/Secret onboarding + Paper Demo (`Free/Used/Total` balance card).
  - Added interactive **تنظیم مقادیر معاملات 🪛** submenu (margin %, TP1/TP2/TP3 split presets & custom entry, max leverage, `@Dollarino_official` signal channel, Risk-Free BE/TP1 toggles).
  - Upgraded **اعلان معاملات بسته (`formatTradeClosedCard`)** and `executor.ts` with exact `تبریک میگم 🤑` / `ضرر هم جزئی از بازار🥲` templates, Iran/Tehran timestamps, and strategy SL/TP/leverage details.
  - Added full **حساب کاربری 👤** (USDT + Toman wallet balance, numeric ID, Persian subscription dates, `افزایش موجودی 💰`, `خرید اشتراک 💎`), 4-plan TRC20 checkout (`$20`/`$50`/`$90`/`$160`), `✅ بررسی پرداخت / ثبت TXID` -> Super Admin approval alert, wallet payment, and subscription/wallet gift code redemption.
  - Added **9-Section Telegram Admin Panel (`apps/worker/src/telegram/admin-menu.ts`)**: Financial & Stats Dashboard, User Search/List/VIP/Downgrade/Charge/Block/Stats, Audience-Targeted Broadcast (text/photo), Transaction Filters + Approve/Reject, Gift Code Wizard & Toggle, Live System Settings Editor (plan prices, margin, leverage, channel, TRC20 wallet, Toman rate, help text/media, `bot_private_admin_only` switch), Time-Filtered Reports with **real downloadable JSON & Excel/CSV (`sendDocument`)**, and **Super Admin (`944021185`)-locked Admin & Permissions Management** with 15-minute idle auto-exit and audit logging.
- **Bidirectional Easy Registration, Login & Account Linking**:
  - Added `/start LINK-XXXXXX` deep-link auto-merge, `/weblogin` + `POST /api/auth/telegram-magic-login` 1-click magic browser login, and `AuthPage.tsx` + `ServicesPage.tsx` + `CopyConnectPage.tsx` 1-click `@Dollarino_bot` links (`t.me/Dollarino_bot?start=...`).
- **Automated Telegram Bot Integration Tests (`apps/worker/src/__tests__/telegram-bot.test.ts`)**: Full Miniflare D1 + mocked Telegram API test suite covering onboarding, Toobit/KCEX, trade quantities, 9-section admin panel, CSV/JSON document export, Super Admin isolation, 15-min timeout, and signal manual confirmation.

## [7.0.0] - 2026-11-20
### Added
- `migrations/0011_custom_strategies.sql`: Added `user_strategies` table (`pine`, `python`, `visual` strategies) and `bot_configs.active_custom_strategy_id` for 24/7 autonomous custom code execution.
- **Simple Mode Guided 4-Step Launcher (TimeTrade Parity)**: Embedded full 4-step launcher (`تنظیم ربات معاملاتی` | `اتصال صرافی واقعی` -> `1. مبلغ سرمایه 2. سطح ریسک 3. استراتژی 4. تأیید و شروع`) directly in Simple Mode (`OverviewPage.tsx`), plus Hourly Trading Activity curve & Open/Settled trade tabs.
- **Pro Quant Strategy IDE (Pine Script v4/v5 + Python + Visual Builder)**:
  - Added deterministic zero-`eval` interpreter in `packages/core/src/custom-strategy-engine.ts` supporting Pine Script v4/v5 (`ta.ema`, `ta.sma`, `ta.rsi`, `ta.atr`, `ta.bb`, `ta.supertrend`, `ta.macd`, `ta.vwap`, `plot()`, `strategy.entry()`) and Python Quant (`df['close'].ewm().mean()`, `rolling()`, `ta.bbands`, `crossover`, `plot()`, `df.loc[..., 'signal']`) plus No-Code Visual Rule Builder and 6 built-in templates (`SAMPLE_CUSTOM_STRATEGIES`).
  - Added Worker CRUD, Live Evaluation & Bot Activation routes (`/api/trading/strategies`, `/evaluate`, `/:id`, `/:id/activate`) and integrated `bot-do.ts` autonomous execution.
  - Added `StrategyIdePanel.tsx` to `RadarLabPage.tsx` (`Pine / Python IDE` tab) and live `Pine/Py` script drawer inside `TerminalPage.tsx` with direct `CandlestickChart.tsx` line plotting & marker overlays.
- **Landing Page Redesign & 3D Brand Visuals**: Added generated glassmorphic 3D assets (`hero-core.png`, `ide-prism.png`, `vault-shield.png`), live scrolling ticker, interactive Desk/Simple/IDE hero switcher, Pine/Python product showcase tab, cryptographic HMAC security section, and animated CSS transitions.

## [6.2.0] - 2026-11-20
### Added
- `migrations/0010_spot_futures_directions_verified_cards.sql`: Added `market_type`, `direction_mode`, and `hedge_mode` on `bot_configs`, `market_type` on `trades`, and `verified_profit_cards` table for tamper-proof HMAC-SHA256 profit cards.
- **Full Spot & Futures Engine**: Live `Toobit` Spot (`/api/v1/spot/order`, `/api/v1/account`) and Futures execution, Paper Spot (`1x` leverage + no margin-short guard), and uncapped Spot (`1000+`) + Futures (`800+`) market scanning & pagination.
- **Dual-Direction & Futures Hedge Mode**: `BOTH` / `LONG_ONLY` / `SHORT_ONLY` direction filtering in risk engine & executor, plus simultaneous LONG + SHORT positions per symbol when `hedge_mode = 1`.
- **Tamper-Proof Verified Profit Cards**: `POST /api/trading/cards/issue`, `GET /api/trading/cards`, `GET /api/public/verify-card/:cardId`, QR-embedded PNG export in `WeeklyCardPage.tsx`, and public verifier route `/verify-card/:cardId` (`VerifyCardPage.tsx`) distinguishing verified `LIVE` vs `PAPER` cards.
- **Telegram Bot & Mini App Integration**: Added `setMyCommands`, `setChatMenuButton`, `POST /api/webhook/telegram/setup`, interactive `web_app` launchers, `/app`, `/positions`, `/balance`, `/settings`, `/help`, callback handlers (`set_mkt:*`, `set_dir:*`, `toggle_hedge`, `tg_positions`, `close_pos:*`, `tg_bot_toggle`), and bidirectional account merge (`POST /api/auth/telegram/merge-code`) in `ServicesPage.tsx`.
- **Iconography & Real-Time Polish**: Multi-CDN + clean inline SVG `CoinIcon`, wired `/api/events/stream` SSE listeners in `Layout.tsx`, and replaced all UI emojis across `apps/web/src` with `lucide-react` icons.

## [6.1.0] - 2026-11-19
### Added
- `migrations/0009_notifications_and_idempotency.sql`: Persistent `notifications` feed and `(user_id, signal_id)` duplicate execution guard index.
- `GET /api/events/stream`, `GET /api/trading/notifications`, `POST /api/trading/notifications/read`, `GET /api/trading/events/snapshot`.
- `apps/web/src/pages/ServicesPage.tsx`: Dedicated Kifpool-style Account & Services Hub (`خدمات`).
- Sculpted curved SVG notch bottom dock (`خانه`, `بازار`, floating center Cobalt trade button, `کیف پول`, `خدمات`) with warm amber active indicator.

### Changed
- Consolidated multi-theme switcher into a single cohesive Apple iOS Cupertino theme supporting Day (`paper`) and Night (`cosmic`) modes.
- Removed top announcement ribbon from `LandingPage.tsx` and restored dark `.console-lab` high-contrast surface for `HybridLab.tsx`.
- Hardened `handler.ts` `channel_post` origin check to official channel `-1002263982097` / `@Dollarino_official` and rejected forwarded posts + expired manual signal confirmations (>60 min).
- Fixed `App.tsx` admin route guard so both `ADMIN` and `OWNER` roles can open `AdminPage`.

## [6.0.0] - 2026-11-19
- Initial v6 release with Chart AI Terminal, Multi-AI Ensemble, Subscriptions, Gift Codes, Referrals, Weekly PNG Cards, Telegram Bot & Mini App HMAC auth.
