import React from 'react';
import { View, Text } from '@tarojs/components';
import type { JunqiRank, JunqiSide } from '../shared/onlineTypes';
import { JUNQI_RANK_NAMES } from '../shared/gameRules';

interface JunqiCapturedTrayProps {
  side: JunqiSide;
  captured: JunqiRank[];
}

const RANK_SORT_ORDER: Record<JunqiRank, number> = {
  9: 1,
  8: 2,
  7: 3,
  6: 4,
  5: 5,
  4: 6,
  3: 7,
  2: 8,
  1: 9,
  10: 10,
  0: 11,
  [-1]: 12,
};

export const JunqiCapturedTray: React.FC<JunqiCapturedTrayProps> = ({ side, captured }) => {
  const sorted = [...captured].sort((a, b) => RANK_SORT_ORDER[a] - RANK_SORT_ORDER[b]);
  const isRed = side === 'RED';
  const title = isRed ? '红方阵亡' : '蓝方阵亡';

  return (
    <View className='captured-tray-card'>
      <View className='captured-tray-head'>
        <Text
          className='font-serif-oriental'
          style={{
            fontSize: '24rpx',
            fontWeight: 700,
            color: isRed ? '#98352E' : '#26568B',
          }}
        >
          {title}
        </Text>
        <Text className='font-mono-tabular' style={{ fontSize: '20rpx', color: '#6E5A4F' }}>
          已损 {captured.length} 枚
        </Text>
      </View>

      {sorted.length === 0 ? (
        <View style={{ padding: '14rpx 0', textAlign: 'center' }}>
          <Text style={{ fontSize: '22rpx', color: '#8D6E63' }}>尚无阵亡</Text>
        </View>
      ) : (
        <View className='captured-chips-wrap'>
          {sorted.map((rank, idx) => (
            <View
              key={`${side}-${rank}-${idx}`}
              className={`captured-chip font-serif-oriental ${
                isRed ? 'captured-chip--red' : 'captured-chip--blue'
              }`}
              style={{ opacity: rank === 0 ? 0.9 : 1 }}
            >
              <Text>{JUNQI_RANK_NAMES[rank]}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
