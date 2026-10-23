import { useEffect, useState } from 'react';
import {
  Loader2, Trophy, Grid3x3, Circle,
  Brain, RefreshCw, ChevronLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { GameMatch, GameScore, GameType, Profile, GameTurn } from '@/types/database';

export default function GamesScreen() {
  const { profile } = useAuth();
  const [view, setView] = useState<'menu' | 'leaderboard' | 'game'>('menu');
  const [activeMatch, setActiveMatch] = useState<GameMatch | null>(null);

  if (view === 'game' && activeMatch) {
    return (
      <GameView
        match={activeMatch}
        profile={profile}
        onBack={() => { setActiveMatch(null); setView('menu'); }}
        onUpdate={(m) => setActiveMatch(m)}
      />
    );
  }

  if (view === 'leaderboard') {
    return <Leaderboard onBack={() => setView('menu')} />;
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-display font-bold text-sage-900">Minigames</h2>
        <button onClick={() => setView('leaderboard')} className="w-10 h-10 rounded-2xl bg-white border border-sage-200 flex items-center justify-center text-sage-600 shadow-soft">
          <Trophy className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        <GameCard
          icon={Grid3x3}
          title="Tic-Tac-Toe"
          desc="3 in eine Reihe"
          color="bg-brand-100 text-brand-600"
          onClick={() => startMatch('tictactoe', profile, setActiveMatch, setView)}
        />
        <GameCard
          icon={Circle}
          title="Vier gewinnt"
          desc="4 in eine Reihe — waagrecht, senkrecht oder diagonal"
          color="bg-sage-100 text-sage-600"
          onClick={() => startMatch('connect4', profile, setActiveMatch, setView)}
        />
        <GameCard
          icon={Brain}
          title="Clari-Quiz"
          desc="Raten aus den Minifacts der Mitbewohner"
          color="bg-purple-100 text-purple-600"
          onClick={() => startMatch('quiz', profile, setActiveMatch, setView)}
        />
      </div>
    </div>
  );
}

async function startMatch(
  gameType: GameType,
  profile: Profile | null,
  setActiveMatch: (m: GameMatch) => void,
  setView: (v: 'game') => void,
) {
  if (!profile) return;

  if (gameType === 'quiz') {
    // Load minifacts for quiz questions
    const { data: facts } = await supabase
      .from('minifacts')
      .select('*, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
      .neq('user_id', profile.id);

    if (!facts || facts.length < 2) {
      alert('Für das Quiz brauchen mindestens 2 Personen Minifacts.');
      return;
    }

    // Build quiz questions: "Wessen Lieblingsgericht ist Lasagne?"
    const questions = facts.slice(0, 10).map((f: Record<string, unknown>) => {
      const p = f.profiles as Profile;
      const name = p.display_name || p.full_name || p.email;
      return {
        fact_key: f.fact_key as string,
        fact_value: f.fact_value as string,
        correct_user_id: p.id,
        correct_name: name,
      };
    });

    // Pick a random opponent for player2
    const otherProfiles = Array.from(new Map(
      facts.map((f: Record<string, unknown>) => {
        const p = f.profiles as Profile;
        return [p.id, p];
      })
    ).values()).filter((p: Profile) => p.id !== profile.id);

    if (otherProfiles.length === 0) {
      alert('Keine anderen Spieler gefunden.');
      return;
    }
    const opponent = otherProfiles[Math.floor(Math.random() * otherProfiles.length)];

    const { data, error } = await supabase.from('game_matches').insert({
      game_type: 'quiz',
      player1_id: profile.id,
      player2_id: opponent.id,
      status: 'active',
      current_turn: 'player1',
      board_state: { p1_score: 0, p2_score: 0 },
      quiz_questions: questions,
      quiz_answers: {},
      quiz_current_index: 0,
      created_by: profile.id,
    }).select().single();

    if (error) { alert(error.message); return; }
    setActiveMatch(data as unknown as GameMatch);
    setView('game');
    return;
  }

  // For tictactoe/connect4: find a random opponent or let user pick
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_approved', true)
    .neq('id', profile.id);

  if (!profiles || profiles.length === 0) {
    alert('Keine anderen Spieler gefunden.');
    return;
  }

  // For now, pick a random opponent
  const opponent = (profiles as Profile[])[Math.floor(Math.random() * profiles.length)];

  const boardState = gameType === 'tictactoe'
    ? { cells: Array(9).fill(null) }
    : { cells: Array(42).fill(null), rows: 6, cols: 7 };

  const { data, error } = await supabase.from('game_matches').insert({
    game_type: gameType,
    player1_id: profile.id,
    player2_id: opponent.id,
    status: 'active',
    current_turn: 'player1',
    board_state: boardState,
    created_by: profile.id,
  }).select().single();

  if (error) { alert(error.message); return; }
  setActiveMatch(data as unknown as GameMatch);
  setView('game');
}

function GameCard({ icon: Icon, title, desc, color, onClick }: {
  icon: typeof Grid3x3;
  title: string;
  desc: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="card w-full flex items-center gap-3 py-4 hover:bg-cream-50 transition text-left">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-sage-900">{title}</p>
        <p className="text-xs text-sage-400">{desc}</p>
      </div>
    </button>
  );
}

// =====================
// Game View
// =====================

function GameView({ match, profile, onBack, onUpdate }: {
  match: GameMatch;
  profile: Profile | null;
  onBack: () => void;
  onUpdate: (m: GameMatch) => void;
}) {
  const [opponent, setOpponent] = useState<Profile | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const otherId = match.player1_id === profile?.id ? match.player2_id : match.player1_id;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', otherId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setOpponent(data as Profile);
      });
  }, [match, profile]);

  const isPlayer1 = match.player1_id === profile?.id;
  const myTurn = (match.current_turn === 'player1' && isPlayer1) || (match.current_turn === 'player2' && !isPlayer1);
  const opponentName = opponent?.display_name || opponent?.full_name || 'Gegner';

  async function updateMatch(updates: Partial<GameMatch>) {
    setUpdating(true);
    const { data, error } = await supabase
      .from('game_matches')
      .update(updates)
      .eq('id', match.id)
      .select()
      .single();
    if (!error && data) onUpdate(data as unknown as GameMatch);
    setUpdating(false);
  }

  async function finishMatch(winnerId: string | null) {
    const isDraw = winnerId === null;
    const updates: Partial<GameMatch> = {
      status: 'finished',
      winner_id: winnerId,
      finished_at: new Date().toISOString(),
    };
    await updateMatch(updates);

    // Update scores for both players
    const p1Result = winnerId === match.player1_id ? 'wins' : isDraw ? 'draws' : 'losses';
    const p2Result = winnerId === match.player2_id ? 'wins' : isDraw ? 'draws' : 'losses';

    for (const [playerId, result] of [[match.player1_id, p1Result], [match.player2_id, p2Result]] as [string, 'wins' | 'losses' | 'draws'][]) {
      const { data: existing } = await supabase
        .from('game_scores')
        .select('*')
        .eq('user_id', playerId)
        .eq('game_type', match.game_type)
        .maybeSingle();

      if (existing) {
        const score = existing as unknown as GameScore;
        await supabase.from('game_scores').update({
          [result]: (score[result] ?? 0) + 1,
        }).eq('id', score.id);
      } else {
        await supabase.from('game_scores').insert({
          user_id: playerId,
          game_type: match.game_type,
          wins: result === 'wins' ? 1 : 0,
          losses: result === 'losses' ? 1 : 0,
          draws: result === 'draws' ? 1 : 0,
        });
      }
    }
  }

  if (match.status === 'finished') {
    const won = match.winner_id === profile?.id;
    const draw = match.winner_id === null;
    return (
      <div className="px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-sm font-semibold text-sage-600 flex items-center gap-1 mb-6">
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
        <div className="text-center py-10">
          <div className={`w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center ${
            draw ? 'bg-cream-200 text-sage-500' : won ? 'bg-brand-100 text-brand-600' : 'bg-red-50 text-red-400'
          }`}>
            <Trophy className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-display font-bold text-sage-900 mb-1">
            {draw ? 'Unentschieden!' : won ? 'Du gewinnst!' : `${opponentName} gewinnt`}
          </h3>
          <button onClick={onBack} className="btn-primary mt-6">
            <RefreshCw className="w-5 h-5" /> Neues Spiel
          </button>
        </div>
      </div>
    );
  }

  if (match.game_type === 'quiz') {
    return <QuizGame match={match} profile={profile} updating={updating} onMove={updateMatch} onFinish={finishMatch} />;
  }

  if (match.game_type === 'tictactoe') {
    return <TicTacToe match={match} profile={profile} opponentName={opponentName} myTurn={myTurn} updating={updating} onMove={updateMatch} onFinish={finishMatch} />;
  }

  return <Connect4 match={match} profile={profile} opponentName={opponentName} myTurn={myTurn} updating={updating} onMove={updateMatch} onFinish={finishMatch} />;
}

// =====================
// Tic-Tac-Toe
// =====================

function TicTacToe({ match, profile, opponentName, myTurn, updating, onMove, onFinish }: {
  match: GameMatch;
  profile: Profile | null;
  opponentName: string;
  myTurn: boolean;
  updating: boolean;
  onMove: (u: Partial<GameMatch>) => Promise<void>;
  onFinish: (winnerId: string | null) => Promise<void>;
}) {
  const cells = (match.board_state.cells as (string | null)[]) ?? Array(9).fill(null);
  const mySymbol = match.player1_id === profile?.id ? 'X' : 'O';

  const winLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  function checkWinner(board: (string | null)[]): string | null {
    for (const [a, b, c] of winLines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a] === 'X' ? 'player1' : 'player2';
      }
    }
    return null;
  }

  async function play(idx: number) {
    if (!myTurn || cells[idx] || updating) return;
    const newCells = [...cells];
    newCells[idx] = mySymbol;
    const winner = checkWinner(newCells);
    const isDraw = !winner && newCells.every(c => c !== null);

    if (winner) {
      const winnerId = winner === 'player1' ? match.player1_id : match.player2_id;
      await onMove({ board_state: { cells: newCells } });
      await onFinish(winnerId);
    } else if (isDraw) {
      await onMove({ board_state: { cells: newCells } });
      await onFinish(null);
    } else {
      const nextTurn: GameTurn = match.current_turn === 'player1' ? 'player2' : 'player1';
      await onMove({ board_state: { cells: newCells }, current_turn: nextTurn });
    }
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <button onClick={() => {}} className="hidden" />
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-sage-700">Du: {mySymbol} · {opponentName}: {mySymbol === 'X' ? 'O' : 'X'}</span>
      </div>
      <p className={`text-center text-sm font-semibold mb-4 ${myTurn ? 'text-brand-600' : 'text-sage-400'}`}>
        {myTurn ? 'Du bist dran' : `${opponentName} ist dran`}
      </p>
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => play(i)}
            disabled={!myTurn || cell !== null || updating}
            className="aspect-square rounded-2xl bg-white border border-cream-200 shadow-soft flex items-center justify-center text-3xl font-bold transition active:scale-95 disabled:opacity-60"
          >
            {cell === 'X' && <span className="text-brand-600">×</span>}
            {cell === 'O' && <span className="text-sage-600">○</span>}
          </button>
        ))}
      </div>
      {updating && <div className="flex justify-center mt-4"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div>}
    </div>
  );
}

// =====================
// Connect 4
// =====================

function Connect4({ match, profile, opponentName, myTurn, updating, onMove, onFinish }: {
  match: GameMatch;
  profile: Profile | null;
  opponentName: string;
  myTurn: boolean;
  updating: boolean;
  onMove: (u: Partial<GameMatch>) => Promise<void>;
  onFinish: (winnerId: string | null) => Promise<void>;
}) {
  const cells = (match.board_state.cells as (string | null)[]) ?? Array(42).fill(null);
  const ROWS = 6, COLS = 7;
  const mySymbol = match.player1_id === profile?.id ? 'R' : 'Y';

  function checkWinner(board: (string | null)[]): string | null {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const val = board[idx];
        if (!val) continue;
        // Horizontal
        if (c < COLS - 3 && val === board[idx + 1] && val === board[idx + 2] && val === board[idx + 3]) {
          return val === 'R' ? 'player1' : 'player2';
        }
        // Vertical
        if (r < ROWS - 3 && val === board[idx + COLS] && val === board[idx + 2 * COLS] && val === board[idx + 3 * COLS]) {
          return val === 'R' ? 'player1' : 'player2';
        }
        // Diagonal down-right
        if (r < ROWS - 3 && c < COLS - 3 && val === board[idx + COLS + 1] && val === board[idx + 2 * (COLS + 1)] && val === board[idx + 3 * (COLS + 1)]) {
          return val === 'R' ? 'player1' : 'player2';
        }
        // Diagonal down-left
        if (r < ROWS - 3 && c >= 3 && val === board[idx + COLS - 1] && val === board[idx + 2 * (COLS - 1)] && val === board[idx + 3 * (COLS - 1)]) {
          return val === 'R' ? 'player1' : 'player2';
        }
      }
    }
    return null;
  }

  async function play(col: number) {
    if (!myTurn || updating) return;
    // Find lowest empty row in this column
    let rowIdx = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const idx = r * COLS + col;
      if (cells[idx] === null) { rowIdx = idx; break; }
    }
    if (rowIdx === -1) return; // column full

    const newCells = [...cells];
    newCells[rowIdx] = mySymbol;
    const winner = checkWinner(newCells);
    const isDraw = !winner && newCells.every(c => c !== null);

    if (winner) {
      const winnerId = winner === 'player1' ? match.player1_id : match.player2_id;
      await onMove({ board_state: { cells: newCells, rows: ROWS, cols: COLS } });
      await onFinish(winnerId);
    } else if (isDraw) {
      await onMove({ board_state: { cells: newCells, rows: ROWS, cols: COLS } });
      await onFinish(null);
    } else {
      const nextTurn: GameTurn = match.current_turn === 'player1' ? 'player2' : 'player1';
      await onMove({ board_state: { cells: newCells, rows: ROWS, cols: COLS }, current_turn: nextTurn });
    }
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <p className={`text-center text-sm font-semibold mb-4 ${myTurn ? 'text-brand-600' : 'text-sage-400'}`}>
        {myTurn ? 'Du bist dran' : `${opponentName} ist dran`}
      </p>
      <div className="bg-sage-600 rounded-2xl p-2 max-w-xs mx-auto">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: COLS }).map((_, col) => (
            <button
              key={`btn-${col}`}
              onClick={() => play(col)}
              disabled={!myTurn || updating}
              className="text-sage-300 text-xs py-1 hover:text-white transition disabled:opacity-30"
            >
              ↓
            </button>
          ))}
          {Array.from({ length: ROWS * COLS }).map((_, i) => {
            const cell = cells[i];
            return (
              <div key={i} className="aspect-square rounded-full bg-sage-700 flex items-center justify-center">
                {cell === 'R' && <div className="w-full h-full rounded-full bg-brand-500" />}
                {cell === 'Y' && <div className="w-full h-full rounded-full bg-amber-400" />}
              </div>
            );
          })}
        </div>
      </div>
      {updating && <div className="flex justify-center mt-4"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div>}
    </div>
  );
}

// =====================
// Quiz
// =====================

function QuizGame({ match, profile, updating, onMove, onFinish }: {
  match: GameMatch;
  profile: Profile | null;
  updating: boolean;
  onMove: (u: Partial<GameMatch>) => Promise<void>;
  onFinish: (winnerId: string | null) => Promise<void>;
}) {
  const questions = (match.quiz_questions as Array<{
    fact_key: string;
    fact_value: string;
    correct_user_id: string;
    correct_name: string;
  }>) ?? [];
  const answers = (match.quiz_answers as Record<string, string>) ?? {};
  const currentIndex = match.quiz_current_index ?? 0;
  const boardState = match.board_state as { p1_score?: number; p2_score?: number };
  const myScore = match.player1_id === profile?.id ? (boardState.p1_score ?? 0) : (boardState.p2_score ?? 0);
  const oppScore = match.player1_id === profile?.id ? (boardState.p2_score ?? 0) : (boardState.p1_score ?? 0);

  // Load all possible answer profiles for the current question
  const [answerOptions, setAnswerOptions] = useState<Profile[]>([]);

  useEffect(() => {
    if (questions.length === 0) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('is_approved', true)
      .limit(20)
      .then(({ data }) => {
        if (data) {
          const allProfiles = data as Profile[];
          const correct = questions[currentIndex];
          if (!correct) { setAnswerOptions([]); return; }
          // Include correct answer + 3 random others
          const correctProfile = allProfiles.find(p => p.id === correct.correct_user_id);
          const others = allProfiles.filter(p => p.id !== correct.correct_user_id);
          const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 3);
          const options = [...shuffled];
          if (correctProfile) options.push(correctProfile);
          options.sort(() => Math.random() - 0.5);
          setAnswerOptions(options);
        }
      });
  }, [questions, currentIndex]);

  if (currentIndex >= questions.length) {
    // Quiz finished
    const winnerId = myScore > oppScore ? profile?.id ?? null : oppScore > myScore ? (match.player1_id === profile?.id ? match.player2_id : match.player1_id) : null;
    onFinish(winnerId);
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>;
  }

  const currentQ = questions[currentIndex];
  const myAnswerKey = `${profile?.id}-${currentIndex}`;
  const hasAnswered = answers[myAnswerKey] !== undefined;

  async function answer(selectedUserId: string) {
    if (hasAnswered || updating) return;
    const isCorrect = selectedUserId === currentQ.correct_user_id;
    const newAnswers = { ...answers, [myAnswerKey]: selectedUserId };
    const newBoard = { ...boardState };
    if (isCorrect) {
      if (isPlayer1) newBoard.p1_score = (newBoard.p1_score ?? 0) + 1;
      else newBoard.p2_score = (newBoard.p2_score ?? 0) + 1;
    }

    const nextTurn: GameTurn = match.current_turn === 'player1' ? 'player2' : 'player1';
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      // Quiz ends after this answer
      await onMove({
        board_state: newBoard,
        quiz_answers: newAnswers,
        quiz_current_index: nextIndex,
      });
      const p1 = newBoard.p1_score ?? 0;
      const p2 = newBoard.p2_score ?? 0;
      const winnerId = p1 > p2 ? match.player1_id : p2 > p1 ? match.player2_id : null;
      await onFinish(winnerId);
    } else {
      await onMove({
        board_state: newBoard,
        quiz_answers: newAnswers,
        quiz_current_index: nextIndex,
        current_turn: nextTurn,
      });
    }
  }

  const isPlayer1 = match.player1_id === profile?.id;

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-brand-600">{myScore}</span>
        <span className="text-xs text-sage-400">Frage {currentIndex + 1} / {questions.length}</span>
        <span className="text-sm font-bold text-sage-600">{oppScore}</span>
      </div>

      <div className="card mb-4 text-center py-6">
        <p className="text-xs text-sage-400 mb-2">Wessen…</p>
        <p className="font-display font-bold text-lg text-sage-900 mb-1">{currentQ.fact_key}</p>
        <p className="text-sm text-sage-600">ist „{currentQ.fact_value}"?</p>
      </div>

      {hasAnswered ? (
        <div className="card text-center py-6">
          <p className="text-sm text-sage-600">Antwort gespeichert!</p>
          <p className="text-xs text-sage-400 mt-1">Richtig: {currentQ.correct_name}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {answerOptions.map(p => (
            <button
              key={p.id}
              onClick={() => answer(p.id)}
              disabled={updating}
              className="card w-full flex items-center gap-3 py-3.5 hover:bg-cream-50 transition text-left active:scale-98"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold shrink-0">
                {(p.display_name || p.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-sage-900 text-sm">{p.display_name || p.full_name || p.email}</span>
            </button>
          ))}
        </div>
      )}

      {updating && <div className="flex justify-center mt-4"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div>}
    </div>
  );
}

// =====================
// Leaderboard
// =====================

function Leaderboard({ onBack }: { onBack: () => void }) {
  const [scores, setScores] = useState<(GameScore & { user_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameType, setGameType] = useState<GameType | 'all'>('all');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('game_scores')
        .select('*, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
        .order('wins', { ascending: false });
      if (!error && data) {
        const enriched = data.map((s: Record<string, unknown>) => {
          const p = s.profiles as Profile;
          return { ...(s as unknown as GameScore), user_name: p.display_name || p.full_name || p.email };
        });
        setScores(enriched);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = gameType === 'all' ? scores : scores.filter(s => s.game_type === gameType);
  const ranked = [...filtered].sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));

  const GAME_LABELS: Record<string, string> = { tictactoe: 'Tic-Tac-Toe', connect4: 'Vier gewinnt', quiz: 'Clari-Quiz' };

  return (
    <div className="px-5 pt-6 pb-4">
      <button onClick={onBack} className="text-sm font-semibold text-sage-600 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>
      <h2 className="text-2xl font-display font-bold text-sage-900 mb-4">Bestenliste</h2>

      <div className="flex rounded-2xl bg-cream-200 p-1 mb-4">
        {(['all', 'tictactoe', 'connect4', 'quiz'] as const).map(gt => (
          <button
            key={gt}
            onClick={() => setGameType(gt)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
              gameType === gt ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
            }`}
          >
            {gt === 'all' ? 'Alle' : GAME_LABELS[gt]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : ranked.length === 0 ? (
        <div className="card text-center py-10">
          <Trophy className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">Noch keine Spiele gespielt.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {ranked.map((s, i) => (
            <div key={s.id} className="card flex items-center gap-3 py-3.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-600' : i === 1 ? 'bg-sage-100 text-sage-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-cream-200 text-sage-400'
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sage-900 text-sm truncate">{s.user_name}</p>
                {gameType === 'all' && <p className="text-xs text-sage-400">{GAME_LABELS[s.game_type]}</p>}
              </div>
              <div className="flex gap-2 text-xs shrink-0">
                <span className="text-brand-600 font-bold">{s.wins}S</span>
                <span className="text-sage-400">{s.draws}U</span>
                <span className="text-red-400">{s.losses}N</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
