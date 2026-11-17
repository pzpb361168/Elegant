import React, { useState } from 'react';
import { X, BookOpen } from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'GOMOKU' | 'XIANGQI' | 'JUNQI';
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'GOMOKU',
}) => {
  const [activeTab, setActiveTab] = useState<'GOMOKU' | 'XIANGQI' | 'JUNQI'>(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-[#F7F3E8] border-2 border-[#7C5332] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#EFE9D8] border-b border-[#D8CBB8]">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#B91C1C]" />
            <h2 className="text-lg font-bold font-serif-oriental text-[#291D16]">
              雅弈阁 · 棋道规则典籍
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭规则弹窗"
            className="p-1.5 rounded-lg text-[#5D4037] hover:bg-[#E4DAC3] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Switcher Tabs */}
        <div className="px-6 pt-4 bg-[#F7F3E8] border-b border-[#D8CBB8] flex items-center gap-2">
          {(
            [
              { id: 'GOMOKU', label: '五子棋规则' },
              { id: 'XIANGQI', label: '中国象棋规则' },
              { id: 'JUNQI', label: '陆战军旗规则' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-[#B91C1C] text-[#B91C1C] bg-[#EFE9D8]/60'
                  : 'border-transparent text-[#6E5A4F] hover:text-[#291D16]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Rules Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm text-[#3E2723] leading-relaxed">
          {activeTab === 'GOMOKU' && (
            <>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  一、棋盘与执子
                </h3>
                <p className="text-xs text-[#5D4037]">
                  五子棋采用标准 15×15 星位棋盘。黑方永远先手，白方后手，双方轮流在棋盘交叉点上落下一子。
                </p>
              </div>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  二、胜负判定
                </h3>
                <p className="text-xs text-[#5D4037]">
                  任意一方率先在横线、竖线或斜线方向上形成连续 5 枚或更多同色棋子（五子连珠），即刻获胜。若棋盘 225 个交叉点全部落满仍无人连成五子，则判为和棋。
                </p>
              </div>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  三、实用攻防诀窍
                </h3>
                <p className="text-xs text-[#5D4037]">
                  善用「活三」（两端无阻挡的三连）与「冲四」迫使对手防守；同时构建「双活三」或「四三杀」是突破高难度 AI 防线的关键。遇到困局时可点击棋盘上方的「支招提示」。
                </p>
              </div>
            </>
          )}

          {activeTab === 'XIANGQI' && (
            <>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  一、各兵种走法口诀
                </h3>
                <ul className="text-xs text-[#5D4037] space-y-1.5 list-disc pl-4">
                  <li>
                    <strong>帅 / 将：</strong>仅限在九宫格内直行或横行，每次一步；且双方将帅不可在同一直线上直接照面（「老将照面」）。
                  </li>
                  <li>
                    <strong>仕 / 士：</strong>仅限在九宫格内沿斜线行棋，每次一步。
                  </li>
                  <li>
                    <strong>相 / 象：</strong>走「田」字对角线，不可越过楚河汉界；若田字中心有棋子阻挡（「塞象眼」），则不能飞越。
                  </li>
                  <li>
                    <strong>马：</strong>走「日」字，若前进方向紧邻的交叉点有棋子阻挡（「蹩马腿」），则无法跃出。
                  </li>
                  <li>
                    <strong>车：</strong>横冲直撞，只要无子阻拦，步数不限。
                  </li>
                  <li>
                    <strong>炮 / 砲：</strong>不吃子时走法同车；吃子时必须隔着恰好一枚棋子（「炮打隔山」）。
                  </li>
                  <li>
                    <strong>兵 / 卒：</strong>未过河前每次只能向前一步；过河后可向前、向左或向右移动一步，但永远不能后退。
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  二、将军与绝杀
                </h3>
                <p className="text-xs text-[#5D4037]">
                  一方棋子下一步可吃掉对方将帅称为「将军」，被将军方必须立即应将解围。若无任何合法解将走法（绝杀或困毙），则对局结束。
                </p>
              </div>
            </>
          )}

          {activeTab === 'JUNQI' && (
            <>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  一、军衔等级与克制关系
                </h3>
                <p className="text-xs text-[#5D4037]">
                  从大到小依次为：<strong>司令 &gt; 军长 &gt; 师长 &gt; 旅长 &gt; 团长 &gt; 营长 &gt; 连长 &gt; 排长 &gt; 工兵</strong>。交战严格遵循<strong>只能大吃小或同级对兑（同归于尽）</strong>，低官阶棋子不可主动撞击高官阶敌子送死。所有阵亡棋子均会在棋盘两侧亮明陈列。
                </p>
                <ul className="text-xs text-[#5D4037] space-y-1 list-disc pl-4 mt-1.5">
                  <li>
                    <strong>炸弹：</strong>可移动，与敌方任何非扛旗棋子（含地雷、司令）交战均同归于尽，可直接炸毁地雷。
                  </li>
                  <li>
                    <strong>地雷（排雷前置）：</strong>不可移动。唯有<strong>工兵</strong>可直接安全排雷；炸弹可直接炸雷（同归于尽）；当己方<strong>已无工兵</strong>时，普通棋子连续撞击同一颗地雷满 3 次亦可抵消清除该雷。
                  </li>
                  <li>
                    <strong>军旗（扛旗归营与无子判输）：</strong>不可移动。须先清除敌方<strong>全部地雷</strong>，再由己方存活<strong>最低官阶</strong>棋子扛起敌旗并<strong>带回己方大本营</strong>方获胜；此外，任一方场上<strong>已无任何可移动棋子或棋子全灭</strong>时直接判输。
                  </li>
                  <li>
                    <strong>带旗护体：</strong>扛起敌方军旗的棋子<strong>不允许被吃掉</strong>，敌军仅可通过卡位阻挡路线的方式进行<strong>堵截</strong>；带旗子自身亦不可主动强攻敌军，需靠友军开路护送回营。
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  二、铁路、公路与行营规则
                </h3>
                <ul className="text-xs text-[#5D4037] space-y-1 list-disc pl-4">
                  <li>
                    <strong>公路线（普通兵站）：</strong>任何可移动棋子每次只能走一步。
                  </li>
                  <li>
                    <strong>铁路线（虚线轨道）：</strong>普通棋子只要轨道通畅，可沿直线长途奔袭任意格数；<strong>工兵</strong>在铁路上可任意拐弯机动！
                  </li>
                  <li>
                    <strong>行营（圆形安全岛）：</strong>进入行营的棋子受到掩体保护，敌方棋子不可直接攻击行营内的驻军。
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-serif-oriental font-bold text-base text-[#291D16] mb-1">
                  三、翻棋模式 vs 布阵模式
                </h3>
                <p className="text-xs text-[#5D4037]">
                  <strong>翻棋模式：</strong>开局所有棋子暗置随机分布在兵站，双方轮流翻开棋子或指挥已翻开的己方棋子作战。<br />
                  <strong>布阵模式：</strong>双方在各自半场排兵布阵（军旗必须入大本营、地雷限后两排、炸弹禁放第一排），布阵完毕后点击「开始交锋」展开战役。
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#EFE9D8] border-t border-[#D8CBB8] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            知悉棋规，返回雅弈阁
          </button>
        </div>
      </div>
    </div>
  );
};
