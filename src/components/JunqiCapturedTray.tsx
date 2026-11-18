import React from 'react';
import type { JunqiRank, JunqiSide } from '../shared/onlineTypes';
import { JUNQI_RANK_NAMES } from '../shared/gameRules';

interface JunqiCapturedTrayProps {
  side: JunqiSide;
  captured: JunqiRank[];
  layout?: 'vertical' | 'horizontal';
}

const RANK_SORT_ORDER: Record<JunqiRank, number> = {
  9: 1,   // 司令
  8: 2,   // 军长
  7: 3,   // 师长
  6: 4,   // 旅长
  5: 5,   // 团长
  4: 6,   // 营长
  3: 7,   // 连长
  2: 8,   // 排长
  1: 9,   // 工兵
  10: 10, // 炸弹
  0: 11,  // 地雷
  [-1]: 12,
};

export const JunqiCapturedTray: React.FC<JunqiCapturedTrayProps> = ({
  side,
  captured,
  layout = 'vertical',
}) => {
  const sorted = [...captured].sort((a, b) => RANK_SORT_ORDER[a] - RANK_SORT_ORDER[b]);
  const isRed = side === 'RED';
  const title = isRed ? '红方阵亡' : '蓝方阵亡';

  return (
    <aside
      aria-label={`${title}棋子区`}
      className={`rounded-xl border border-[#D8CBB8] bg-[#EFE9D8]/95 p-2.5 flex flex-col ${
        layout === 'vertical'
          ? 'w-full md:w-[110px] lg:w-[116px] shrink-0'
          : 'w-full'
      }`}
    >
      <div className="flex items-center justify-between md:flex-col md:items-start md:gap-0.5 pb-2 mb-2 border-b border-[#D8CBB8]">
        <span
          className={`text-xs font-serif-oriental font-bold tracking-wide ${
            isRed ? 'text-[#98352E]' : 'text-[#26568B]'
          }`}
        >
          {title}
        </span>
        <span className="text-[11px] font-mono-tabular text-[#6E5A4F]">
          已损 {captured.length} 枚
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-4 text-[11px] text-[#8D6E63] text-center leading-relaxed">
          尚无阵亡
        </div>
      ) : (
        <div
          className={`grid gap-1.5 content-start ${
            layout === 'vertical'
              ? 'grid-cols-6 sm:grid-cols-8 md:grid-cols-2'
              : 'grid-cols-6 sm:grid-cols-8'
          }`}
        >
          {sorted.map((rank, idx) => (
            <div
              key={`${side}-${rank}-${idx}`}
              title={`${isRed ? '红' : '蓝'}方阵亡：${JUNQI_RANK_NAMES[rank]}`}
              className={`h-6 px-1 rounded-[5px] flex items-center justify-center font-serif-oriental font-bold text-[11px] tracking-wider border shadow-[0_1px_2px_rgba(0,0,0,0.22)] select-none ${
                isRed
                  ? 'bg-gradient-to-b from-[#9E342C] to-[#7D241E] text-[#FFFDF9] border-[#F5D0C5]/75'
                  : 'bg-gradient-to-b from-[#2B629E] to-[#1B416C] text-[#FFFDF9] border-[#BFDBFE]/75'
              } ${rank === 0 ? 'opacity-90' : ''}`}
            >
              {JUNQI_RANK_NAMES[rank]}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
