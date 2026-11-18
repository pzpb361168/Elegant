import React, { useState, useEffect } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';

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

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  return (
    <View className='fullscreen-modal-mask'>
      <View className='fullscreen-modal-card'>
        {/* Modal Header */}
        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24rpx 28rpx',
            backgroundColor: '#EFE9D8',
            borderBottom: '2rpx solid #D8CBB8',
          }}
        >
          <Text className='font-serif-oriental' style={{ fontSize: '32rpx', fontWeight: 700, color: '#291D16' }}>
            雅弈阁 · 棋道规则典籍
          </Text>
          <Button
            onClick={onClose}
            style={{
              padding: '8rpx 18rpx',
              borderRadius: '10rpx',
              backgroundColor: '#E4DAC3',
              color: '#3E2723',
              fontSize: '24rpx',
              fontWeight: 600,
            }}
          >
            关闭
          </Button>
        </View>

        {/* Game Switcher Tabs */}
        <View
          style={{
            padding: '16rpx 24rpx 0',
            backgroundColor: '#F7F3E8',
            borderBottom: '2rpx solid #D8CBB8',
            display: 'flex',
            gap: '12rpx',
          }}
        >
          {(
            [
              { id: 'GOMOKU', label: '五子棋' },
              { id: 'XIANGQI', label: '中国象棋' },
              { id: 'JUNQI', label: '陆战军旗' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '14rpx 22rpx',
                  fontSize: '24rpx',
                  fontWeight: 600,
                  borderBottom: active ? '4rpx solid #B91C1C' : '4rpx solid transparent',
                  color: active ? '#B91C1C' : '#6E5A4F',
                  backgroundColor: active ? 'rgba(239, 233, 216, 0.7)' : 'transparent',
                  borderTopLeftRadius: '10rpx',
                  borderTopRightRadius: '10rpx',
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </View>

        {/* Rules Body */}
        <ScrollView scrollY style={{ maxHeight: '55vh', padding: '26rpx 28rpx' }}>
          {activeTab === 'GOMOKU' && (
            <View style={{ display: 'flex', flexDirection: 'column', gap: '20rpx' }}>
              <View>
                <Text className='font-serif-oriental' style={{ display: 'block', fontSize: '28rpx', fontWeight: 700, color: '#291D16', marginBottom: '6rpx' }}>
                  一、棋盘与执子
                </Text>
                <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.65' }}>
                  五子棋采用标准 15×15 星位棋盘。黑方永远先手，白方后手，双方轮流在棋盘交叉点上落下一子。
                </Text>
              </View>
              <View>
                <Text className='font-serif-oriental' style={{ display: 'block', fontSize: '28rpx', fontWeight: 700, color: '#291D16', marginBottom: '6rpx' }}>
                  二、胜负判定
                </Text>
                <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.65' }}>
                  任意一方率先在横线、竖线或斜线方向上形成连续 5 枚或更多同色棋子（五子连珠），即刻获胜。若棋盘 225 个交叉点全部落满仍无人连成五子，则判为和棋。
                </Text>
              </View>
              <View>
                <Text className='font-serif-oriental' style={{ display: 'block', fontSize: '28rpx', fontWeight: 700, color: '#291D16', marginBottom: '6rpx' }}>
                  三、实用攻防诀窍
                </Text>
                <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.65' }}>
                  善用「活三」（两端无阻挡的三连）与「冲四」迫使对手防守；同时构建「双活三」或「四三杀」是突破高难度 AI 防线的关键。遇到困局时可点击「支招提示」。
                </Text>
              </View>
            </View>
          )}

          {activeTab === 'XIANGQI' && (
            <View style={{ display: 'flex', flexDirection: 'column', gap: '18rpx' }}>
              <Text className='font-serif-oriental' style={{ display: 'block', fontSize: '28rpx', fontWeight: 700, color: '#291D16' }}>
                一、各兵种走法口诀
              </Text>
              {[
                '帅 / 将：仅限在九宫格内直行或横行，每次一步；且双方将帅不可在同一直线上直接照面。',
                '仕 / 士：仅限在九宫格内沿斜线行棋，每次一步。',
                '相 / 象：走「田」字对角线，不可越过楚河汉界；若田字中心有子（「塞象眼」），不能飞越。',
                '马：走「日」字，若前进方向紧邻交叉点有子（「蹩马腿」），则无法跃出。',
                '车：横冲直撞，无子阻拦时步数不限。',
                '炮 / 砲：不吃子走法同车；吃子时须隔着恰好一枚棋子（「炮打隔山」）。',
                '兵 / 卒：未过河前每次向前一步；过河后可向前、左、右移动一步，不能后退。',
              ].map((line, i) => (
                <Text key={i} style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.6' }}>
                  • {line}
                </Text>
              ))}
              <View style={{ marginTop: '8rpx' }}>
                <Text className='font-serif-oriental' style={{ display: 'block', fontSize: '28rpx', fontWeight: 700, color: '#291D16', marginBottom: '6rpx' }}>
                  二、将军与绝杀
                </Text>
                <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.65' }}>
                  一方棋子下一步可吃掉对方将帅称为「将军」，被将军方必须立即应将解围。若无任何合法解将走法（绝杀或困毙），则对局结束。
                </Text>
              </View>
            </View>
          )}

          {activeTab === 'JUNQI' && (
            <View style={{ display: 'flex', flexDirection: 'column', gap: '18rpx' }}>
              <View>
                <Text className='font-serif-oriental' style={{ display: 'block', fontSize: '28rpx', fontWeight: 700, color: '#291D16', marginBottom: '6rpx' }}>
                  一、军衔等级与作战新规
                </Text>
                <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.65' }}>
                  从大到小：司令 &gt; 军长 &gt; 师长 &gt; 旅长 &gt; 团长 &gt; 营长 &gt; 连长 &gt; 排长 &gt; 工兵。严格遵循只能大吃小或同级对兑（同归于尽），低官阶棋子不可主动撞击高官阶敌子送死。所有阵亡棋子均会在棋盘两侧亮明陈列。
                </Text>
              </View>
              {[
                '炸弹：可移动，与敌方任何非扛旗棋子（含地雷、司令）交战均同归于尽，可直接炸毁地雷。',
                '地雷（排雷前置）：不可移动。唯有工兵可直接安全排雷；炸弹可直接炸雷（同归于尽）；当己方已无工兵时，普通棋子连续撞击同一颗地雷满 3 次亦可抵消清除该雷。',
                '军旗（扛旗归营与无子判输）：不可移动。须先清除敌方全部地雷，再由己方存活最低官阶棋子扛起敌旗并带回己方大本营方获胜；任一方已无任何可移动棋子或棋子全灭时直接判输。',
                '带旗护体：扛起敌方军旗的棋子不允许被吃掉，敌军仅可通过卡位阻挡路线的方式进行堵截。',
                '铁路与行营：普通棋子沿直线铁路畅行，工兵可在铁路任意拐弯；行营内驻军受保护不可被直接攻击。',
              ].map((line, i) => (
                <Text key={i} style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.6' }}>
                  • {line}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            padding: '20rpx 28rpx',
            backgroundColor: '#EFE9D8',
            borderTop: '2rpx solid #D8CBB8',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button onClick={onClose} className='btn-primary-dark'>
            知悉棋规，返回雅弈阁
          </Button>
        </View>
      </View>
    </View>
  );
};
