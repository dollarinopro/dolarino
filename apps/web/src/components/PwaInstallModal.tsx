import { CheckCircle2, Download, Laptop, Monitor, Share, Smartphone, X } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { usePwaInstall } from '../lib/pwa';
import { DollarinoBrandMark } from './BrandGraphics';

export function PwaInstallModal({
  lang,
  onClose,
}: {
  lang: Lang;
  onClose: () => void;
}) {
  const { canPromptNatively, isInstalled, isIos, promptInstall } = usePwaInstall();
  const isFa = lang === 'fa';

  const handleInstall = async () => {
    await promptInstall();
  };

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="surface-card max-w-lg w-full p-6 space-y-5 shadow-2xl my-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarinoBrandMark size={44} glow />
            <div>
              <h3 className="font-black text-base text-main">
                {isFa ? 'نصب اپلیکیشن دلارینو (ویندوز و موبایل)' : 'Install Dollarino App (Windows & Mobile)'}
              </h3>
              <p className="text-xs text-sub">
                {isFa ? 'وب‌اپلیکیشن پیشرفته (PWA) — سریع و مستقل روی دسکتاپ و موبایل' : 'Progressive Web App — Fast standalone desktop & mobile experience'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl surface-soft text-sub hover:text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isInstalled ? (
          <div className="p-4 rounded-2xl badge-signal flex items-center gap-3 text-xs text-signal font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              {isFa ? 'اپلیکیشن دلارینو هم‌اکنون نصب شده و در حال اجراست!' : 'Dollarino is already installed on this device!'}
            </span>
          </div>
        ) : (
          <>
            {canPromptNatively ? (
              <button
                onClick={handleInstall}
                className="w-full py-3 rounded-2xl btn-cobalt font-extrabold text-sm flex items-center justify-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'نصب فوری اپلیکیشن روی دستگاه شما' : 'Install Dollarino App Now'}</span>
              </button>
            ) : (
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-xs text-main space-y-1">
                <p className="font-black">
                  {isFa ? 'نکته مهم برای نصب روی گوشی و ویندوز:' : 'Quick Install Tip:'}
                </p>
                <p className="text-dim leading-relaxed">
                  {isFa
                    ? 'اگر این صفحه از داخل تلگرام باز شده است، از منوی بالای صفحه گزینه «Open in Chrome / Safari» (باز کردن در مرورگر) را بزنید تا گزینه نصب مستقیم اپلیکیشن ظاهر شود.'
                    : 'If opened inside Telegram in-app browser, tap the top menu → "Open in Chrome / Safari" so the direct app installer appears.'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl surface-soft border space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-main">
                  <Monitor className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'نسخه ویندوز (Windows)' : 'Windows & macOS Desktop'}</span>
                </div>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'در مرورگر Chrome یا Edge، روی آیکون «نصب / کامپیوتر» در نوار آدرس کلیک کنید تا آیکون روی دسکتاپ اضافه شود.'
                    : 'In Chrome or Edge, click the Install icon in the address bar (or Menu → Install Dollarino) to launch as a standalone app.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl surface-soft border space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-main">
                  <Smartphone className="w-4 h-4 text-signal" />
                  <span>{isFa ? 'اندروید و آیفون (iOS)' : 'Android & iPhone (iOS)'}</span>
                </div>
                <p className="text-sub leading-relaxed">
                  {isIos || isFa
                    ? 'در اندروید (Chrome): گزینه «نصب برنامه» را بزنید. در آیفون (Safari): دکمه Share را زده و «Add to Home Screen» را انتخاب کنید.'
                    : 'On Android Chrome tap "Install app". On iPhone Safari tap Share → "Add to Home Screen".'}
                </p>
              </div>
            </div>

            {isIos && (
              <div className="p-3.5 rounded-2xl banner-cobalt-soft text-xs text-brand font-bold flex items-center gap-2">
                <Share className="w-4 h-4 shrink-0" />
                <span>
                  {isFa
                    ? 'برای نصب در آیفون سایت را با Safari باز کنید و Share → Add to Home Screen را بزنید.'
                    : 'On iOS, open in Safari → tap Share → tap Add to Home Screen.'}
                </span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between pt-2 border-t text-[11px] text-dim">
          <span className="inline-flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5" /> Windows · macOS · Android · iOS
          </span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-xl surface-soft border text-main font-bold">
            {isFa ? 'بستن' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
