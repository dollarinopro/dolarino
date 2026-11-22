import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { Lang } from '../lib/i18n';

export function FaqPage({ lang }: { lang: Lang }) {
  const isFa = lang === 'fa';
  const [open, setOpen] = useState<number | null>(0);

  const items = isFa
    ? [
        [
          'چت هوش مصنوعی اختصاصی دلارینو و تحلیل عکس چارت چطور کار می‌کند؟',
          'از دکمه شناور پایین صفحه یا صفحه اختصاصی «چت هوش مصنوعی AI» می‌توانید دقیقاً مثل یک هوش مصنوعی کامل گفتگو کنید، از لیست بالا مدل دلخواهتان را انتخاب کنید (مدل‌های متصل سیستم یا کلیدهای شخصی خودتان)، و حتی عکس چارت بفرستید یا Paste کنید تا هوش مصنوعی ساختار چارت را تحلیل کرده و ستاپ دقیق (ورود، حد ضرر و ۳ تارگت) ارائه دهد. همین قابلیت مستقیماً داخل ربات تلگرام @Dollarino_bot با دستور /ai یا ارسال مستقیم عکس چارت نیز فعال است.',
        ],
        [
          'طراح، توسعه‌دهنده و سازنده پلتفرم دلارینو کیست؟',
          'پلتفرم معاملاتی هوشمند دلارینو توسط آوید کیا (Avid Kiya) طراحی و ساخته شده است. صفحات رسمی سازنده: تلگرام @avidkiya · اینستاگرام و توییتر (X): @avid_kiya',
        ],
        [
          '۴ موتور معاملاتی دلارینو کدام‌ها هستند و چطور کار می‌کنند؟',
          '۱) هوش مصنوعی دلارینو (تحلیل چارت، ورود و مدیریت پوزیشن اتومات)، ۲) هوش مصنوعی من (تربیت AI شخصی خودتان با گفتگوی فارسی)، ۳) استراتژی شکار / دُرنا V1 (الگوریتم اختصاصی شکار اسپایک با ۳ تارگت و تریلینگ SL)، و ۴) کپی‌ترید تاییدشده (آینه‌سازی معاملات تریدرهای تاییدشده روی حساب شما). در سراسر وب‌اپ و ربات تلگرام می‌توانید موتور فعال خود را با یک کلیک جابه‌جا کنید.',
        ],
        [
          'کارت سود تاییدشده (Profit Card) و کارت بسته شدن سیگنال چه تفاوتی دارند؟',
          'کارت سود در بازه‌های ۷ روزه، ۳۰ روزه و یک‌ساله با خروجی PNG رسمی (۱۶:۹ یا ۳:۴ استوری)، واترمارک دلارینو و مهر بزرگ «حساب واقعی / حساب دمو» صادر می‌شود و هر فرد با شناسه تأیید می‌تواند اصالت آن را در سایت بررسی کند. هنگام بسته شدن هر سیگنال نیز کارت رسمی نتیجه معامله همراه با TP1/TP2/TP3 و Trailing SL در کانال رسمی و ربات ارسال می‌شود.',
        ],
        [
          'خرید اشتراک با تتر TRC20 و دعوت دوستان چطور انجام می‌شود؟',
          'پس از واریز مبلغ اشتراک به آدرس TRC20 داخل صفحه اشتراک، کافی است لینک یا هش TXID را ثبت کنید تا سیستم از طریق شبکه TRON تراکنش را بررسی و اشتراک شما را خودکار فعال کند. همچنین با لینک اختصاصی دعوت دوستان (یا کد ?ref= هنگام ثبت‌نام)، پاداش معرفی روی کیف پول و اشتراک شما منظور می‌شود.',
        ],
        [
          'کانال و ربات رسمی دلارینو کدامند و چطور از کلاهبرداری در امان بمانیم؟',
          'تنها کانال رسمی دلارینو @Dollarino_official و تنها ربات و پشتیبانی رسمی @Dollarino_bot (و تیکت آنلاین داخل همین وب‌اپ) هستند. دلارینو هیچ آیدی پشتیبانی متفرقه یا ادمینی که اول پیام بدهد ندارد و هرگز کلید خصوصی یا دسترسی برداشت صرافی را نمی‌خواهد.',
        ],
        [
          'آیا سرمایه من در صرافی‌های Toobit و KCEX امن است؟',
          'بله، سرمایه شما در حساب صرافی خودتان می‌ماند. کلیدهای API با استاندارد AES-256 رمزنگاری می‌شوند و تنها دسترسی معامله (بدون مجوز برداشت) نیاز دارند.',
        ],
      ]
    : [
        [
          'What are the 4 Dollarino trading engines?',
          '1) Dollarino AI (autonomous chart & position AI), 2) My Trainable AI (teach your personal agent via chat), 3) Hunting Engine / Dorna V1 (precision 3-TP + trailing SL scanner), and 4) Verified Copy-Trade (mirror admin-vetted live traders). The same 4 engines are synced across Web and @Dollarino_bot.',
        ],
        [
          'How do Verified Profit Cards & Signal Closed cards work?',
          'Generate official 16:9 or 3:4 PNG Profit Cards (7D, 30D, 1Y) with watermarked Dollarino branding, a bold LIVE vs DEMO stamp, and cryptographic verification IDs. When trades close, result cards with TP1–TP3 and Trailing SL status are posted automatically.',
        ],
        [
          'How do TRC20 auto-verification and referrals work?',
          'Paste your TRC20 TXID or TronScan link on the Subscription page for instant on-chain verification. Share your referral link (?ref=CODE) so invited users earn rewards upon signup and subscription.',
        ],
        [
          'Which handles are official and how do I stay safe from impersonators?',
          'Our ONLY official bot & support handle is @Dollarino_bot and our official channel is @Dollarino_official (plus the in-app Online Support modal). Dollarino staff never DM you first or ask for withdrawal scopes.',
        ],
        [
          'Are my exchange funds safe?',
          'Yes. Funds never leave your Toobit or KCEX account. API credentials are encrypted with AES-256 and require Trade-Only access with zero withdrawal scope.',
        ],
      ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
          GUIDE & FAQ
        </p>
        <h2 className="font-display font-bold text-3xl text-main">
          {isFa ? 'راهنمای سریع و سوالات پرتکرار' : 'Quick Guide & FAQ'}
        </h2>
      </div>

      <div className="panel rounded-[26px] p-5 sm:p-6 space-y-3">
        {items.map(([q, a], idx) => {
          const isOpen = open === idx;
          return (
            <div key={q} className="rounded-2xl surface-soft overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : idx)}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-start font-bold text-xs sm:text-sm text-main"
              >
                <span>{q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <p className="px-4 pb-4 text-xs text-dim leading-relaxed">{a}</p>}
            </div>
          );
        })}
      </div>

      <div className="panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-dim">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-jade shrink-0" />
          <span>
            {isFa
              ? 'همیشه تنظیمات ریسک و اهرم را متناسب با سرمایه خود انتخاب کنید و برای هر سوال با پشتیبانی آنلاین در تماس باشید.'
              : 'Always size leverage conservatively according to your risk tolerance and contact Online Support anytime.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
          <span className="text-main">{isFa ? 'سازنده: آوید کیا' : 'Creator: Avid Kiya'}</span>
          <a href="https://t.me/avidkiya" target="_blank" rel="noreferrer" dir="ltr" className="text-[var(--gold)] hover:underline">
            TG @avidkiya
          </a>
          <a href="https://instagram.com/avid_kiya" target="_blank" rel="noreferrer" dir="ltr" className="text-jade hover:underline">
            IG / X @avid_kiya
          </a>
        </div>
      </div>
    </div>
  );
}
