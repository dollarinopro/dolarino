import { Moon, Sun, X } from 'lucide-react';
import type { Lang } from '../lib/i18n';

export type LookId = 'paper' | 'cosmic';

export function AppearanceModal({
  open,
  lang,
  currentLook,
  onSelectLook,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  currentLook: LookId;
  onSelectLook: (look: LookId) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const isFa = lang === 'fa';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="pop-in panel rounded-[28px] max-w-sm w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-main">
            {isFa ? 'حالت نمایش آیفونی' : 'Apple Display Mode'}
          </h3>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full btn-ghost grid place-items-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'paper' as LookId, icon: Sun, title: isFa ? 'حالت روز' : 'Daylight', color: '#F59E0B' },
            { id: 'cosmic' as LookId, icon: Moon, title: isFa ? 'حالت شب' : 'Night', color: '#38BDF8' },
          ]).map((opt) => {
            const Icon = opt.icon;
            const active = currentLook === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelectLook(opt.id);
                  onClose();
                }}
                className={`p-4 rounded-2xl flex flex-col items-center gap-2 border-2 transition ${
                  active ? 'border-[var(--gold)] bg-[var(--soft)]' : 'border-transparent surface-soft'
                }`}
              >
                <Icon className="w-6 h-6" style={{ color: opt.color }} />
                <span className="text-xs font-black text-main">{opt.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
