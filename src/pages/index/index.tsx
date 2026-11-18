import React, { useState, useCallback, useRef } from 'react';
import { useLoad, useShareAppMessage } from '@tarojs/taro';
import { View, Text, Button } from '@tarojs/components';
import { AIDifficulty, AllGameStats, GameTab, JunqiSubMode, PlayMode } from '../../types/game';
import { loadGameStats, recordGameOutcome, resetAllGameStats } from '../../utils/storage';
import { soundFX } from '../../utils/sound';
import { LobbyView } from '../../components/LobbyView';
import { GomokuGame } from '../../components/GomokuGame';
import { XiangqiGame } from '../../components/XiangqiGame';
import { JunqiGame } from '../../components/JunqiGame';
import { OnlineArena } from '../../components/OnlineArena';
import { RulesModal } from '../../components/RulesModal';

const NAV_ITEMS: { id: GameTab; label: string; glyph: string }[] = [
  { id: 'LOBBY', label: '大厅', glyph: '阁' },
  { id: 'GOMOKU', label: '五子', glyph: '弈' },
  { id: 'XIANGQI', label: '象棋', glyph: '帥' },
  { id: 'JUNQI', label: '军旗', glyph: '旗' },
  { id: 'ONLINE', label: '联机', glyph: '友' },
];

export default function IndexPage() {
  const [initialRoomCode, setInitialRoomCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GameTab>('LOBBY');
  const [playMode, setPlayMode] = useState<PlayMode>('PVE');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('MEDIUM');
  const [junqiSubMode, setJunqiSubMode] = useState<JunqiSubMode>('FLIP');
  const [stats, setStats] = useState<AllGameStats>(loadGameStats);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFX.isEnabled());
  const [rulesModal, setRulesModal] = useState<{
    open: boolean;
    tab: 'GOMOKU' | 'XIANGQI' | 'JUNQI';
  }>({ open: false, tab: 'GOMOKU' });

  const currentRoomIdRef = useRef<string | null>(null);

  useLoad((options) => {
    const code = options?.room ? String(options.room).trim().toUpperCase() : null;
    if (code) {
      setInitialRoomCode(code);
      setActiveTab('ONLINE');
      currentRoomIdRef.current = code;
    }
  });

  useShareAppMessage(() => {
    const roomId = currentRoomIdRef.current;
    if (roomId) {
      return {
        title: `雅弈阁对弈邀请 · 房间号 #${roomId}`,
        path: `/pages/index/index?room=${roomId}`,
      };
    }
    return {
      title: '雅弈阁 · 五子棋 / 中国象棋 / 陆战军旗',
      path: '/pages/index/index',
    };
  });

  const handleRoomSync = useCallback((roomId: string | null) => {
    currentRoomIdRef.current = roomId;
  }, []);

  const handleToggleSound = () => {
    const next = soundFX.toggle();
    setSoundEnabled(next);
  };

  const handleSelectGame = (
    game: Exclude<GameTab, 'LOBBY' | 'ONLINE'>,
    mode?: PlayMode,
    junqiSub?: JunqiSubMode
  ) => {
    if (mode) setPlayMode(mode);
    if (junqiSub) setJunqiSubMode(junqiSub);
    setActiveTab(game);
    soundFX.playSelect();
  };

  const handleRecordOutcome = useCallback(
    (game: Exclude<GameTab, 'LOBBY' | 'ONLINE'>, outcome: 'WIN' | 'LOSS' | 'DRAW') => {
      const updated = recordGameOutcome(game, outcome);
      setStats(updated);
    },
    []
  );

  const handleResetStats = () => {
    const cleared = resetAllGameStats();
    setStats(cleared);
    soundFX.playSelect();
  };

  return (
    <View className='app-shell'>
      {/* Sticky Top Header */}
      <View className='top-header'>
        <View
          className='brand-wrap'
          onClick={() => {
            setActiveTab('LOBBY');
            soundFX.playSelect();
          }}
        >
          <Text className='brand-title font-serif-oriental'>雅弈阁</Text>
          <Text className='brand-sub'>东方木艺棋室</Text>
        </View>

        <View className='header-actions'>
          <Button
            onClick={() => {
              const tab =
                activeTab === 'XIANGQI' || activeTab === 'JUNQI' ? activeTab : 'GOMOKU';
              setRulesModal({ open: true, tab });
            }}
            className='header-pill-btn'
          >
            典籍
          </Button>
          <Button
            onClick={handleToggleSound}
            className={`header-pill-btn ${soundEnabled ? 'header-pill-btn--on' : ''}`}
          >
            {soundEnabled ? '音效：开' : '音效：关'}
          </Button>
        </View>
      </View>

      {/* Main Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'LOBBY' && (
          <LobbyView
            stats={stats}
            onSelectGame={handleSelectGame}
            onOpenOnline={() => {
              setActiveTab('ONLINE');
              soundFX.playSelect();
            }}
            onOpenRules={(tab) => setRulesModal({ open: true, tab })}
            onResetStats={handleResetStats}
          />
        )}

        {activeTab === 'GOMOKU' && (
          <GomokuGame
            playMode={playMode}
            difficulty={difficulty}
            onModeChange={setPlayMode}
            onDifficultyChange={setDifficulty}
            onRecordResult={(res) => handleRecordOutcome('GOMOKU', res)}
          />
        )}

        {activeTab === 'XIANGQI' && (
          <XiangqiGame
            playMode={playMode}
            difficulty={difficulty}
            onModeChange={setPlayMode}
            onDifficultyChange={setDifficulty}
            onRecordResult={(res) => handleRecordOutcome('XIANGQI', res)}
          />
        )}

        {activeTab === 'JUNQI' && (
          <JunqiGame
            playMode={playMode}
            subMode={junqiSubMode}
            difficulty={difficulty}
            onModeChange={setPlayMode}
            onSubModeChange={setJunqiSubMode}
            onDifficultyChange={setDifficulty}
            onRecordResult={(res) => handleRecordOutcome('JUNQI', res)}
          />
        )}

        {activeTab === 'ONLINE' && (
          <OnlineArena initialRoomCode={initialRoomCode} onRoomUrlSync={handleRoomSync} />
        )}
      </View>

      {/* Custom Bottom Navigation Bar */}
      <View className='bottom-nav'>
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <View
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                soundFX.playSelect();
              }}
              className={`bottom-nav-item ${active ? 'bottom-nav-item--active' : ''}`}
            >
              <Text className='bottom-nav-glyph font-serif-oriental'>{item.glyph}</Text>
              <Text className='bottom-nav-label'>{item.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Rules Modal */}
      <RulesModal
        isOpen={rulesModal.open}
        initialTab={rulesModal.tab}
        onClose={() => setRulesModal((prev) => ({ ...prev, open: false }))}
      />
    </View>
  );
}
