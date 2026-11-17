/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { AIDifficulty, AllGameStats, GameTab, JunqiSubMode, PlayMode } from './types/game';
import { loadGameStats, recordGameOutcome, resetAllGameStats } from './utils/storage';
import { soundFX } from './utils/sound';
import { LobbyView } from './components/LobbyView';
import { GomokuGame } from './components/GomokuGame';
import { XiangqiGame } from './components/XiangqiGame';
import { JunqiGame } from './components/JunqiGame';
import { OnlineArena } from './components/OnlineArena';
import { RulesModal } from './components/RulesModal';
import { Volume2, VolumeX, BookOpen } from 'lucide-react';

function getInitialRoomParam(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  return code ? code.trim().toUpperCase() : null;
}

export default function App() {
  const [initialRoomCode] = useState<string | null>(getInitialRoomParam);
  const [activeTab, setActiveTab] = useState<GameTab>(() =>
    getInitialRoomParam() ? 'ONLINE' : 'LOBBY'
  );
  const [playMode, setPlayMode] = useState<PlayMode>('PVE');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('MEDIUM');
  const [junqiSubMode, setJunqiSubMode] = useState<JunqiSubMode>('FLIP');
  const [stats, setStats] = useState<AllGameStats>(loadGameStats);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFX.isEnabled());
  const [rulesModal, setRulesModal] = useState<{
    open: boolean;
    tab: 'GOMOKU' | 'XIANGQI' | 'JUNQI';
  }>({ open: false, tab: 'GOMOKU' });

  const handleRoomUrlSync = useCallback((roomId: string | null) => {
    const url = new URL(window.location.href);
    if (roomId) {
      url.searchParams.set('room', roomId);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
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
    <div className="min-h-screen flex flex-col paper-texture text-[#291D16]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#F7F3E8]/95 backdrop-blur-sm border-b border-[#D8CBB8] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#lobby"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('LOBBY');
            soundFX.playSelect();
          }}
          className="text-xl font-bold font-serif-oriental tracking-tight text-[#291D16] whitespace-nowrap shrink-0"
        >
          雅弈阁
        </a>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="flex items-center gap-4 sm:gap-7 text-sm font-medium text-[#5D4037] overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('LOBBY');
              soundFX.playSelect();
            }}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'LOBBY'
                ? 'border-[#B91C1C] text-[#291D16] font-semibold'
                : 'border-transparent hover:text-[#291D16] hover:border-[#8D6E63]'
            }`}
          >
            棋室大厅
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('GOMOKU');
              soundFX.playSelect();
            }}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'GOMOKU'
                ? 'border-[#B91C1C] text-[#291D16] font-semibold'
                : 'border-transparent hover:text-[#291D16] hover:border-[#8D6E63]'
            }`}
          >
            五子棋
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('XIANGQI');
              soundFX.playSelect();
            }}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'XIANGQI'
                ? 'border-[#B91C1C] text-[#291D16] font-semibold'
                : 'border-transparent hover:text-[#291D16] hover:border-[#8D6E63]'
            }`}
          >
            中国象棋
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('JUNQI');
              soundFX.playSelect();
            }}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'JUNQI'
                ? 'border-[#B91C1C] text-[#291D16] font-semibold'
                : 'border-transparent hover:text-[#291D16] hover:border-[#8D6E63]'
            }`}
          >
            陆战军旗
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('ONLINE');
              soundFX.playSelect();
            }}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'ONLINE'
                ? 'border-[#B91C1C] text-[#291D16] font-semibold'
                : 'border-transparent hover:text-[#291D16] hover:border-[#8D6E63]'
            }`}
          >
            联机弈馆
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleToggleSound}
            className="px-3.5 py-2 text-xs font-medium text-[#291D16] bg-[#EFE9D8] hover:bg-[#E4DAC3] border border-[#D8CBB8] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#0F766E]" />
                落子音效：开
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-[#8D6E63]" />
                落子音效：关
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
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
          <OnlineArena
            initialRoomCode={initialRoomCode}
            onRoomUrlSync={handleRoomUrlSync}
          />
        )}
      </main>

      {/* Quiet Oriental Footer */}
      <footer className="border-t border-[#D8CBB8] bg-[#EFE9D8]/70 py-5 px-6 flex flex-wrap items-center justify-center gap-4 text-xs text-[#6E5A4F]">
        <span>雅弈阁 · 东方经典木艺棋室 — 支持人机博弈、本地双人与实时联机对弈</span>
        <button
          type="button"
          onClick={() => {
            const tab =
              activeTab === 'XIANGQI' || activeTab === 'JUNQI' ? activeTab : 'GOMOKU';
            setRulesModal({ open: true, tab });
          }}
          className="inline-flex items-center gap-1 text-[#7C5332] hover:text-[#291D16] hover:underline cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5" />
          查阅棋道典籍
        </button>
      </footer>

      {/* Rules Modal */}
      <RulesModal
        isOpen={rulesModal.open}
        initialTab={rulesModal.tab}
        onClose={() => setRulesModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
