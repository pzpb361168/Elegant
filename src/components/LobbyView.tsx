import React from 'react';
import { AllGameStats, GameTab, JunqiSubMode, PlayMode } from '../types/game';
import { ArrowRight, BookOpen, RotateCcw, Wifi } from 'lucide-react';

interface LobbyViewProps {
  stats: AllGameStats;
  onSelectGame: (game: Exclude<GameTab, 'LOBBY' | 'ONLINE'>, mode?: PlayMode, junqiSub?: JunqiSubMode) => void;
  onOpenOnline: () => void;
  onOpenRules: (tab: 'GOMOKU' | 'XIANGQI' | 'JUNQI') => void;
  onResetStats: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  stats,
  onSelectGame,
  onOpenOnline,
  onOpenRules,
  onResetStats,
}) => {
  const totalGames =
    stats.GOMOKU.wins +
    stats.GOMOKU.losses +
    stats.GOMOKU.draws +
    stats.XIANGQI.wins +
    stats.XIANGQI.losses +
    stats.XIANGQI.draws +
    stats.JUNQI.wins +
    stats.JUNQI.losses +
    stats.JUNQI.draws;

  const totalWins = stats.GOMOKU.wins + stats.XIANGQI.wins + stats.JUNQI.wins;

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      {/* Oriental Tea-House Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-[#EFE9D8] border border-[#D8CBB8] rounded-2xl p-6 sm:p-10 shadow-sm">
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="text-xs text-[#7C5332] font-medium tracking-wider">
              东方木艺棋室 · 纹枰论道 · 手谈雅集
            </div>
            <h1
              className="text-3xl sm:text-5xl font-bold font-serif-oriental text-[#291D16] leading-tight"
              style={{ textWrap: 'balance' }}
            >
              清茶一盏会知音，方寸木盘定乾坤
            </h1>
            <p className="text-sm sm:text-base text-[#5D4037] max-w-2xl leading-relaxed">
              欢迎莅临「雅弈阁」。阁内陈设香榧木十五路五子棋盘、楚河汉界传统象棋与铁道沙盘陆战军旗。既可独自与多境界 AI 博弈推演，亦可同屏或远程联机手谈。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onOpenOnline}
              className="px-5 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wifi className="w-4 h-4" />
              进入联机弈馆
            </button>
            <button
              onClick={() => onSelectGame('GOMOKU', 'PVE')}
              className="px-4 py-2.5 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              单机人机对弈
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onOpenRules('GOMOKU')}
              className="px-4 py-2.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#291D16] text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              查阅三棋典籍
            </button>
          </div>
        </div>

        {/* Right Decorative Wooden Emblem & Session Summary */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-xl wood-board-surface border border-[#7C5332] p-6 text-[#291D16]">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs text-[#4E342E] font-medium">本机棋手战绩总览</span>
              <h2 className="text-2xl font-bold font-serif-oriental text-[#291D16] mt-0.5">
                弈林履历
              </h2>
            </div>
            {/* Traditional Cinnabar Seal */}
            <div className="w-11 h-11 rounded border-2 border-[#B91C1C] bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center font-serif-oriental font-bold text-xs leading-tight text-center select-none">
              雅弈<br />上品
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 my-6">
            <div className="bg-[#F7F3E8]/85 rounded-lg p-3 border border-[#8D6E63]/30">
              <div className="text-xs text-[#6E5A4F]">累计对局</div>
              <div className="text-2xl font-bold font-mono-tabular text-[#291D16] mt-0.5">
                {totalGames}
              </div>
            </div>
            <div className="bg-[#F7F3E8]/85 rounded-lg p-3 border border-[#8D6E63]/30">
              <div className="text-xs text-[#6E5A4F]">夺魁胜场</div>
              <div className="text-2xl font-bold font-mono-tabular text-[#B91C1C] mt-0.5">
                {totalWins}
              </div>
            </div>
            <div className="bg-[#F7F3E8]/85 rounded-lg p-3 border border-[#8D6E63]/30">
              <div className="text-xs text-[#6E5A4F]">综合胜率</div>
              <div className="text-2xl font-bold font-mono-tabular text-[#0F766E] mt-0.5">
                {totalGames > 0 ? `${Math.round((totalWins / totalGames) * 100)}%` : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#4E342E] pt-2 border-t border-[#5D4037]/25">
            <span>人机对战 · 双人同屏 · 自动保存战绩</span>
            {totalGames > 0 && (
              <button
                onClick={onResetStats}
                className="inline-flex items-center gap-1 text-[#B91C1C] hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                重置战绩
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3 Classic Games Pavilion Cards */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#D8CBB8] pb-3">
          <div>
            <h2 className="text-2xl font-bold font-serif-oriental text-[#291D16]">
              三大国粹棋席
            </h2>
            <p className="text-xs text-[#6E5A4F] mt-0.5">
              任选一方棋席入座，随时切换「人机挑战」或「本地双人对弈」
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Gomoku */}
          <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-2xl p-6 flex flex-col justify-between hover:border-[#8D6E63] transition-colors">
            <div>
              {/* Custom Mini Gomoku SVG Illustration */}
              <div className="h-40 rounded-xl wood-board-surface border border-[#7C5332] mb-5 flex items-center justify-center p-4">
                <svg viewBox="0 0 160 100" className="w-full h-full">
                  {[20, 50, 80].map((y) => (
                    <line key={y} x1="20" y1={y} x2="140" y2={y} stroke="#3E2723" strokeWidth="1.5" />
                  ))}
                  {[35, 65, 95, 125].map((x) => (
                    <line key={x} x1={x} y1="10" x2={x} y2="90" stroke="#3E2723" strokeWidth="1.5" />
                  ))}
                  {/* Black stones diagonal */}
                  <circle cx="35" cy="80" r="10" fill="#171717" />
                  <circle cx="65" cy="50" r="10" fill="#171717" />
                  <circle cx="95" cy="20" r="10" fill="#171717" />
                  {/* White stones */}
                  <circle cx="65" cy="80" r="10" fill="#F5F5F4" stroke="#78716C" strokeWidth="1" />
                  <circle cx="95" cy="50" r="10" fill="#F5F5F4" stroke="#78716C" strokeWidth="1" />
                </svg>
              </div>

              <div className="text-xs text-[#6E5A4F] mb-1">
                <span>15×15 标准路盘</span>
                <span aria-hidden="true"> · </span>
                <span>黑先白后</span>
                <span aria-hidden="true"> · </span>
                <span>智能支招</span>
              </div>
              <h3 className="text-xl font-bold font-serif-oriental text-[#291D16] mb-2">
                01. 五子连珠 (五子棋)
              </h3>
              <p className="text-xs text-[#5D4037] leading-relaxed mb-5">
                黑白云子交错于十五路香榧木盘，纵横斜线五子相连即胜。内置初窥、登堂、宗师三档启发式评分 AI，兼备落点支招与连珠高亮。
              </p>
            </div>

            <div className="space-y-3 pt-3 border-t border-[#D8CBB8]">
              <div className="flex items-center justify-between text-xs text-[#6E5A4F] font-mono-tabular">
                <span>
                  战绩：{stats.GOMOKU.wins}胜 · {stats.GOMOKU.losses}负 · {stats.GOMOKU.draws}和
                </span>
                <button
                  onClick={() => onOpenRules('GOMOKU')}
                  className="text-[#7C5332] hover:underline cursor-pointer"
                >
                  棋规说明
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => onSelectGame('GOMOKU', 'PVE')}
                  className="py-2 px-3 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  人机对战
                </button>
                <button
                  onClick={() => onSelectGame('GOMOKU', 'PVP')}
                  className="py-2 px-3 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#291D16] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  双人同屏
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Xiangqi */}
          <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-2xl p-6 flex flex-col justify-between hover:border-[#8D6E63] transition-colors">
            <div>
              {/* Custom Mini Xiangqi SVG Illustration */}
              <div className="h-40 rounded-xl wood-board-surface border border-[#7C5332] mb-5 flex items-center justify-center p-4">
                <svg viewBox="0 0 160 100" className="w-full h-full">
                  <rect x="20" y="12" width="120" height="76" fill="none" stroke="#3E2723" strokeWidth="1.8" />
                  <line x1="60" y1="12" x2="100" y2="50" stroke="#3E2723" strokeWidth="1.2" />
                  <line x1="100" y1="12" x2="60" y2="50" stroke="#3E2723" strokeWidth="1.2" />
                  {/* Red General Disc */}
                  <circle cx="52" cy="52" r="19" fill="#FDF8EE" stroke="#991B1B" strokeWidth="2" />
                  <text
                    x="52"
                    y="58"
                    textAnchor="middle"
                    className="fill-[#B91C1C] font-serif-oriental font-bold text-[18px]"
                  >
                    帥
                  </text>
                  {/* Black General Disc */}
                  <circle cx="108" cy="48" r="19" fill="#FDF8EE" stroke="#1E293B" strokeWidth="2" />
                  <text
                    x="108"
                    y="54"
                    textAnchor="middle"
                    className="fill-[#1E293B] font-serif-oriental font-bold text-[18px]"
                  >
                    將
                  </text>
                </svg>
              </div>

              <div className="text-xs text-[#6E5A4F] mb-1">
                <span>9×10 楚河汉界</span>
                <span aria-hidden="true"> · </span>
                <span>应将绝杀</span>
                <span aria-hidden="true"> · </span>
                <span>着法记录</span>
              </div>
              <h3 className="text-xl font-bold font-serif-oriental text-[#291D16] mb-2">
                02. 楚河汉界 (中国象棋)
              </h3>
              <p className="text-xs text-[#5D4037] leading-relaxed mb-5">
                车马炮纵横驰骋，完整还原蹩马腿、塞象眼、老将照面及实时将军预警规则。点击棋子即刻浮现翡翠绿合法落点，支持悔棋与残局复盘。
              </p>
            </div>

            <div className="space-y-3 pt-3 border-t border-[#D8CBB8]">
              <div className="flex items-center justify-between text-xs text-[#6E5A4F] font-mono-tabular">
                <span>
                  战绩：{stats.XIANGQI.wins}胜 · {stats.XIANGQI.losses}负 · {stats.XIANGQI.draws}和
                </span>
                <button
                  onClick={() => onOpenRules('XIANGQI')}
                  className="text-[#7C5332] hover:underline cursor-pointer"
                >
                  棋规说明
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => onSelectGame('XIANGQI', 'PVE')}
                  className="py-2 px-3 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  人机对战
                </button>
                <button
                  onClick={() => onSelectGame('XIANGQI', 'PVP')}
                  className="py-2 px-3 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#291D16] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  双人同屏
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Junqi */}
          <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-2xl p-6 flex flex-col justify-between hover:border-[#8D6E63] transition-colors">
            <div>
              {/* Custom Mini Junqi SVG Illustration matching reference board */}
              <div className="h-40 rounded-xl bg-[#EFE6CE] border-2 border-[#A68B5B] mb-5 flex items-center justify-center p-3 shadow-inner">
                <svg viewBox="0 0 180 105" className="w-full h-full">
                  {/* River frontline band */}
                  <rect x="6" y="42" width="168" height="22" fill="#BAD4CE" />
                  <line x1="6" y1="42" x2="174" y2="42" stroke="#638F8C" strokeWidth="1.2" />
                  <line x1="6" y1="64" x2="174" y2="64" stroke="#638F8C" strokeWidth="1.2" />
                  {/* Twin peaks */}
                  <polygon points="52,60 60,46 66,53 71,48 78,60" fill="#707D5B" stroke="#3B2E25" strokeWidth="1" />
                  <polygon points="104,60 112,46 118,53 123,48 130,60" fill="#707D5B" stroke="#3B2E25" strokeWidth="1" />
                  {/* Railway tracks */}
                  <line x1="28" y1="12" x2="28" y2="92" stroke="#3B2E25" strokeWidth="4" />
                  <line x1="28" y1="12" x2="28" y2="92" stroke="#F6F1E2" strokeWidth="1.6" strokeDasharray="3 3" />
                  <line x1="152" y1="12" x2="152" y2="92" stroke="#3B2E25" strokeWidth="4" />
                  <line x1="152" y1="12" x2="152" y2="92" stroke="#F6F1E2" strokeWidth="1.6" strokeDasharray="3 3" />
                  {/* Top Red HQ & Bottom Blue HQ */}
                  <rect x="44" y="10" width="40" height="20" rx="4" fill="#96352F" stroke="#3B2E25" strokeWidth="1.2" />
                  <text x="64" y="23" textAnchor="middle" className="fill-white font-serif-oriental font-bold text-[8px]">
                    大本营
                  </text>
                  <rect x="96" y="74" width="40" height="20" rx="4" fill="#26568B" stroke="#3B2E25" strokeWidth="1.2" />
                  <text x="116" y="87" textAnchor="middle" className="fill-white font-serif-oriental font-bold text-[8px]">
                    大本营
                  </text>
                  {/* Sample Camp circles */}
                  <circle cx="64" cy="78" r="9" fill="#F5EFE0" stroke="#3B2E25" strokeWidth="1.2" />
                  <circle cx="116" cy="24" r="9" fill="#F5EFE0" stroke="#3B2E25" strokeWidth="1.2" />
                </svg>
              </div>

              <div className="text-xs text-[#6E5A4F] mb-1">
                <span>翻棋 / 布阵双模式</span>
                <span aria-hidden="true"> · </span>
                <span>工兵飞铁</span>
                <span aria-hidden="true"> · </span>
                <span>预设名阵</span>
              </div>
              <h3 className="text-xl font-bold font-serif-oriental text-[#291D16] mb-2">
                03. 铁道沙盘 (陆战军旗)
              </h3>
              <p className="text-xs text-[#5D4037] leading-relaxed mb-5">
                支持「随机翻棋」与「排兵布阵」双玩法自由切换。内置工兵铁路全图寻路算法、行营掩体保护及司军师旅团营连排自动比大小裁定。
              </p>
            </div>

            <div className="space-y-3 pt-3 border-t border-[#D8CBB8]">
              <div className="flex items-center justify-between text-xs text-[#6E5A4F] font-mono-tabular">
                <span>
                  战绩：{stats.JUNQI.wins}胜 · {stats.JUNQI.losses}负 · {stats.JUNQI.draws}和
                </span>
                <button
                  onClick={() => onOpenRules('JUNQI')}
                  className="text-[#7C5332] hover:underline cursor-pointer"
                >
                  棋规说明
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => onSelectGame('JUNQI', 'PVE', 'FLIP')}
                  className="py-2 px-3 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  翻棋模式
                </button>
                <button
                  onClick={() => onSelectGame('JUNQI', 'PVE', 'DEPLOY')}
                  className="py-2 px-3 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  布阵模式
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
