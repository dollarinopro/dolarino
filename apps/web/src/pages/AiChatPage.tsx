import { Sparkles } from 'lucide-react';
import { DedicatedAiChatSurface } from '../components/FloatingAiChat';
import type { Lang } from '../lib/i18n';
import type { NavTab } from '../lib/types';

export function AiChatPage({
  lang,
  onNavigate,
  onSelectSymbolForTerminal,
}: {
  lang: Lang;
  onNavigate: (tab: NavTab) => void;
  onSelectSymbolForTerminal: (symbol: string) => void;
}) {
  const isFa = lang === 'fa';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase inline-flex items-center gap-1" style={{ color: 'var(--gold)' }}>
            <Sparkles className="w-3 h-3" />
            DEDICATED MULTI-MODEL & CHART VISION AI
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
            {isFa ? 'صفحه چت اختصاصی هوش مصنوعی دلارینو' : 'Dollarino Dedicated AI Chat & Chart Vision'}
          </h2>
        </div>
      </div>

      <DedicatedAiChatSurface
        lang={lang}
        compact={false}
        onNavigate={onNavigate}
        onSelectSymbolForTerminal={onSelectSymbolForTerminal}
      />
    </div>
  );
}
