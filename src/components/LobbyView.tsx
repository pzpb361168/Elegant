import React from 'react';
import { View, Text, Button } from '@tarojs/components';
import { AllGameStats, GameTab, JunqiSubMode, PlayMode } from '../types/game';

interface LobbyViewProps {
  stats: AllGameStats;
  onSelectGame: (
    game: Exclude<GameTab, 'LOBBY' | 'ONLINE'>,
    mode?: PlayMode,
    junqiSub?: JunqiSubMode
  ) => void;
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
    <View className='page-container'>
      {/* Hero Section */}
      <View className='card-panel'>
        <Text className='hero-badge'>东方木艺棋室 · 纹枰论道 · 手谈雅集</Text>
        <Text className='hero-title font-serif-oriental' style={{ display: 'block' }}>
          清茶一盏会知音，方寸木盘定乾坤
        </Text>
        <Text className='hero-desc' style={{ display: 'block' }}>
          欢迎莅临「雅弈阁」微信小程序。阁内陈设香榧木十五路五子棋盘、楚河汉界传统象棋与铁道沙盘陆战军旗。支持单机人机、双人同屏与实时微信联机手谈。
        </Text>

        <View className='hero-actions'>
          <Button onClick={onOpenOnline} className='btn-primary-red'>
            进入联机弈馆
          </Button>
          <Button onClick={() => onSelectGame('GOMOKU', 'PVE')} className='btn-primary-dark'>
            单机人机对弈
          </Button>
          <Button onClick={() => onOpenRules('GOMOKU')} className='btn-soft'>
            查阅三棋典籍
          </Button>
        </View>
      </View>

      {/* Stats Summary Wooden Plaque */}
      <View className='card-panel wood-surface'>
        <View style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: '22rpx', color: '#4E342E', fontWeight: 600 }}>
              本机棋手战绩总览
            </Text>
            <Text
              className='font-serif-oriental'
              style={{ display: 'block', fontSize: '36rpx', fontWeight: 700, color: '#291D16', marginTop: '4rpx' }}
            >
              弈林履历
            </Text>
          </View>
          <View className='seal-stamp font-serif-oriental'>
            <Text>雅弈</Text>
            <Text>上品</Text>
          </View>
        </View>

        <View className='stats-grid-3'>
          <View className='stat-box'>
            <Text className='stat-label'>累计对局</Text>
            <Text className='stat-val font-mono-tabular' style={{ display: 'block', color: '#291D16' }}>
              {totalGames}
            </Text>
          </View>
          <View className='stat-box'>
            <Text className='stat-label'>夺魁胜场</Text>
            <Text className='stat-val font-mono-tabular' style={{ display: 'block', color: '#B91C1C' }}>
              {totalWins}
            </Text>
          </View>
          <View className='stat-box'>
            <Text className='stat-label'>综合胜率</Text>
            <Text className='stat-val font-mono-tabular' style={{ display: 'block', color: '#0F766E' }}>
              {totalGames > 0 ? `${Math.round((totalWins / totalGames) * 100)}%` : '—'}
            </Text>
          </View>
        </View>

        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14rpx',
            borderTop: '2rpx solid rgba(93, 64, 55, 0.24)',
          }}
        >
          <Text style={{ fontSize: '22rpx', color: '#4E342E' }}>
            人机对战 · 双人同屏 · 自动保存战绩
          </Text>
          {totalGames > 0 && (
            <Button
              onClick={onResetStats}
              style={{ fontSize: '22rpx', color: '#B91C1C', fontWeight: 600 }}
            >
              重置战绩
            </Button>
          )}
        </View>
      </View>

      {/* Section Title */}
      <View style={{ padding: '6rpx 4rpx' }}>
        <Text className='font-serif-oriental' style={{ fontSize: '36rpx', fontWeight: 700, color: '#291D16', display: 'block' }}>
          三大国粹棋席
        </Text>
        <Text style={{ fontSize: '22rpx', color: '#6E5A4F', marginTop: '4rpx', display: 'block' }}>
          任选一方棋席入座，随时切换「人机挑战」或「本地双人对弈」
        </Text>
      </View>

      {/* Card 1: Gomoku */}
      <View className='card-panel'>
        <View className='game-card-preview wood-surface'>
          <View
            style={{
              width: '260rpx',
              height: '130rpx',
              border: '2rpx solid #3E2723',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '18rpx',
            }}
          >
            <View className='gomoku-stone gomoku-stone--black' style={{ width: '44rpx', height: '44rpx' }} />
            <View className='gomoku-stone gomoku-stone--white' style={{ width: '44rpx', height: '44rpx' }} />
            <View className='gomoku-stone gomoku-stone--black' style={{ width: '44rpx', height: '44rpx' }} />
          </View>
        </View>

        <Text style={{ fontSize: '22rpx', color: '#6E5A4F', display: 'block', marginBottom: '6rpx' }}>
          15×15 标准路盘 · 黑先白后 · 智能支招
        </Text>
        <Text className='font-serif-oriental' style={{ fontSize: '34rpx', fontWeight: 700, color: '#291D16', display: 'block', marginBottom: '10rpx' }}>
          01. 五子连珠 (五子棋)
        </Text>
        <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.6', display: 'block', marginBottom: '20rpx' }}>
          黑白云子交错于十五路香榧木盘，纵横斜线五子相连即胜。内置初窥、登堂、宗师三档启发式评分 AI，兼备落点支招与连珠高亮。
        </Text>

        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14rpx',
            marginBottom: '16rpx',
            borderTop: '2rpx solid #D8CBB8',
          }}
        >
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            战绩：{stats.GOMOKU.wins}胜 · {stats.GOMOKU.losses}负 · {stats.GOMOKU.draws}和
          </Text>
          <Button
            onClick={() => onOpenRules('GOMOKU')}
            style={{ fontSize: '22rpx', color: '#7C5332', fontWeight: 600 }}
          >
            棋规说明
          </Button>
        </View>

        <View style={{ display: 'flex', gap: '16rpx' }}>
          <Button
            onClick={() => onSelectGame('GOMOKU', 'PVE')}
            className='btn-primary-dark'
            style={{ flex: 1 }}
          >
            人机对战
          </Button>
          <Button
            onClick={() => onSelectGame('GOMOKU', 'PVP')}
            className='btn-soft'
            style={{ flex: 1 }}
          >
            双人同屏
          </Button>
        </View>
      </View>

      {/* Card 2: Xiangqi */}
      <View className='card-panel'>
        <View className='game-card-preview wood-surface'>
          <View style={{ display: 'flex', alignItems: 'center', gap: '36rpx' }}>
            <View className='xiangqi-piece xiangqi-piece--red' style={{ width: '92rpx', height: '92rpx' }}>
              <View className='xiangqi-piece-inner font-serif-oriental' style={{ fontSize: '42rpx' }}>
                帥
              </View>
            </View>
            <View className='xiangqi-piece xiangqi-piece--black' style={{ width: '92rpx', height: '92rpx' }}>
              <View className='xiangqi-piece-inner font-serif-oriental' style={{ fontSize: '42rpx' }}>
                將
              </View>
            </View>
          </View>
        </View>

        <Text style={{ fontSize: '22rpx', color: '#6E5A4F', display: 'block', marginBottom: '6rpx' }}>
          9×10 楚河汉界 · 应将绝杀 · 着法记录
        </Text>
        <Text className='font-serif-oriental' style={{ fontSize: '34rpx', fontWeight: 700, color: '#291D16', display: 'block', marginBottom: '10rpx' }}>
          02. 楚河汉界 (中国象棋)
        </Text>
        <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.6', display: 'block', marginBottom: '20rpx' }}>
          车马炮纵横驰骋，完整还原蹩马腿、塞象眼、老将照面及实时将军预警规则。点击棋子浮现合法落点，支持悔棋与复盘。
        </Text>

        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14rpx',
            marginBottom: '16rpx',
            borderTop: '2rpx solid #D8CBB8',
          }}
        >
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            战绩：{stats.XIANGQI.wins}胜 · {stats.XIANGQI.losses}负 · {stats.XIANGQI.draws}和
          </Text>
          <Button
            onClick={() => onOpenRules('XIANGQI')}
            style={{ fontSize: '22rpx', color: '#7C5332', fontWeight: 600 }}
          >
            棋规说明
          </Button>
        </View>

        <View style={{ display: 'flex', gap: '16rpx' }}>
          <Button
            onClick={() => onSelectGame('XIANGQI', 'PVE')}
            className='btn-primary-dark'
            style={{ flex: 1 }}
          >
            人机对战
          </Button>
          <Button
            onClick={() => onSelectGame('XIANGQI', 'PVP')}
            className='btn-soft'
            style={{ flex: 1 }}
          >
            双人同屏
          </Button>
        </View>
      </View>

      {/* Card 3: Junqi */}
      <View className='card-panel'>
        <View
          className='game-card-preview'
          style={{ backgroundColor: '#EFE6CE', border: '3rpx solid #A68B5B' }}
        >
          <View style={{ display: 'flex', alignItems: 'center', gap: '20rpx' }}>
            <View className='junqi-tile junqi-tile--red font-serif-oriental' style={{ width: '110rpx', height: '54rpx', fontSize: '24rpx' }}>
              司令
            </View>
            <View
              style={{
                padding: '6rpx 16rpx',
                borderRadius: '10rpx',
                backgroundColor: '#BAD4CE',
                border: '2rpx solid #638F8C',
                color: '#33271E',
                fontSize: '22rpx',
                fontWeight: 700,
              }}
              className='font-serif-oriental'
            >
              前线
            </View>
            <View className='junqi-tile junqi-tile--blue font-serif-oriental' style={{ width: '110rpx', height: '54rpx', fontSize: '24rpx' }}>
              军旗
            </View>
          </View>
        </View>

        <Text style={{ fontSize: '22rpx', color: '#6E5A4F', display: 'block', marginBottom: '6rpx' }}>
          翻棋 / 布阵双模式 · 工兵排雷 · 扛旗归营
        </Text>
        <Text className='font-serif-oriental' style={{ fontSize: '34rpx', fontWeight: 700, color: '#291D16', display: 'block', marginBottom: '10rpx' }}>
          03. 铁道沙盘 (陆战军旗)
        </Text>
        <Text style={{ fontSize: '24rpx', color: '#5D4037', lineHeight: '1.6', display: 'block', marginBottom: '20rpx' }}>
          支持「随机翻棋」与「排兵布阵」双玩法，严格大吃小/同归与排雷前置规则：排完敌雷后由最低官阶扛旗回己方大本营获胜，两侧亮明阵亡棋子。
        </Text>

        <View
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14rpx',
            marginBottom: '16rpx',
            borderTop: '2rpx solid #D8CBB8',
          }}
        >
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            战绩：{stats.JUNQI.wins}胜 · {stats.JUNQI.losses}负 · {stats.JUNQI.draws}和
          </Text>
          <Button
            onClick={() => onOpenRules('JUNQI')}
            style={{ fontSize: '22rpx', color: '#7C5332', fontWeight: 600 }}
          >
            棋规说明
          </Button>
        </View>

        <View style={{ display: 'flex', gap: '16rpx' }}>
          <Button
            onClick={() => onSelectGame('JUNQI', 'PVE', 'FLIP')}
            className='btn-primary-dark'
            style={{ flex: 1 }}
          >
            翻棋模式
          </Button>
          <Button
            onClick={() => onSelectGame('JUNQI', 'PVE', 'DEPLOY')}
            className='btn-primary-red'
            style={{ flex: 1 }}
          >
            布阵模式
          </Button>
        </View>
      </View>
    </View>
  );
};
