'use client';

import { ScoreCard, ScoreCategory } from "../page";

type Player = 1 | 2;

interface ScoreboardProps {
  currentRound: number;
  currentPlayer: Player;
  rollsLeft: number;
  scoreCards: {
    player1: ScoreCard,
    player2: ScoreCard
  };
  currentFaces: number[];
  handleScoreSelect: (category: ScoreCategory) => void;
  calculateScore: (category: ScoreCategory, faces: number[]) => number;
  getTotalScore: (player: Player) => number;
  isRolling: boolean;
  isMyTurn?: boolean;
  myPlayerNumber?: Player | null;
  opponentCurrentFaces?: number[];
  opponentRollsLeft?: number;
}

const Scoreboard: React.FC<ScoreboardProps> = ({
  currentRound,
  currentPlayer,
  rollsLeft,
  scoreCards,
  currentFaces,
  handleScoreSelect,
  calculateScore,
  getTotalScore,
  isRolling,
  isMyTurn = true,
  myPlayerNumber = null,
  opponentCurrentFaces = [1, 1, 1, 1, 1],
  opponentRollsLeft = 3
}) => {
  const getUpperScore = (player: Player) => {
    const scoreCard = player === 1 ? scoreCards.player1 : scoreCards.player2;
    const upperCategories: (keyof ScoreCard)[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
    return upperCategories.reduce((sum, category) => sum + (scoreCard[category] || 0), 0);
  };

  const upperSectionCategories = [
    { key: 'ones' as keyof ScoreCard, name: '⚀ 一点' },
    { key: 'twos' as keyof ScoreCard, name: '⚁ 二点' },
    { key: 'threes' as keyof ScoreCard, name: '⚂ 三点' },
    { key: 'fours' as keyof ScoreCard, name: '⚃ 四点' },
    { key: 'fives' as keyof ScoreCard, name: '⚄ 五点' },
    { key: 'sixes' as keyof ScoreCard, name: '⚅ 六点' }
  ];

  const chanceCategory = { key: 'chance' as keyof ScoreCard, name: '🎲 全选' };

  const specialCategories = [
    { key: 'fourOfKind' as keyof ScoreCard, name: '🎯 四骰同花' },
    { key: 'fullHouse' as keyof ScoreCard, name: '🏠 葫芦' },
    { key: 'smallStraight' as keyof ScoreCard, name: '📏 小顺' },
    { key: 'largeStraight' as keyof ScoreCard, name: '📐 大顺' },
    { key: 'yahtzee' as keyof ScoreCard, name: '🚤 快艇' }
  ];

  const renderScoreCell = (player: Player, category: ScoreCategory) => {
    const scoreCard = player === 1 ? scoreCards.player1 : scoreCards.player2;
    const isCurrentPlayer = player === currentPlayer;

    if (scoreCard[category] !== null) {
      return scoreCard[category];
    }

    const playerIsCurrentPlayer = player === currentPlayer;
    const playerIsMyPlayer = player === myPlayerNumber;

    // 如果是自己的回合，显示自己的可选分数
    if (playerIsCurrentPlayer && playerIsMyPlayer && isMyTurn && rollsLeft < 3 && !isRolling) {
      return calculateScore(category, currentFaces);
    }

    // 如果是对手的回合，显示对手的可选分数
    if (playerIsCurrentPlayer && !playerIsMyPlayer && !isMyTurn && opponentRollsLeft < 3) {
      return calculateScore(category, opponentCurrentFaces);
    }

    return '\u00A0';
  }

  const Cell = ({ player, category, children }: { player: Player, category: ScoreCategory, children: React.ReactNode }) => {
    const scoreCard = player === 1 ? scoreCards.player1 : scoreCards.player2;
    const isCurrentPlayer = player === currentPlayer;
    const isMyPlayer = player === myPlayerNumber;
    const isSelectable = isCurrentPlayer && isMyPlayer && isMyTurn && rollsLeft < 3 && scoreCard[category] === null;

    // 检查是否是对手可选择的分数（用于显示高亮）
    const isOpponentSelectable = isCurrentPlayer && !isMyPlayer && !isMyTurn &&
                                 opponentRollsLeft < 3 && scoreCard[category] === null;

    return (
      <div
        className={`
          flex-1 p-0.5 text-center font-mono text-xs flex items-center justify-center border-l border-gray-300 dark:border-gray-600
          transition-all duration-200 h-11
          ${isSelectable ?
            'bg-yellow-200 dark:bg-yellow-400/80 hover:bg-yellow-300 cursor-pointer text-gray-800' :
            ''
          }
          ${isOpponentSelectable ?
            'bg-orange-100 dark:bg-orange-900/30 text-gray-700 dark:text-gray-300' :
            ''
          }
          ${scoreCard[category] !== null ?
            `font-bold ${player === 1 ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}` :
            'text-gray-600 dark:text-gray-400'
          }
          ${isCurrentPlayer && scoreCard[category] === null && !isSelectable && !isOpponentSelectable ?
            `${player === 1 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-purple-50 dark:bg-purple-900/20'}` :
            ''
          }
        `}
        onClick={() => isSelectable && handleScoreSelect(category)}
      >
        {children}
      </div>
    );
  };
  
  return (
    <div className="w-full h-full flex flex-col justify-between text-gray-800 dark:text-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 rounded-lg p-2 text-white text-center shadow-lg h-16 flex flex-col justify-center">
        <div className="text-sm font-bold">回合 {currentRound}/12</div>
        <div className="w-full bg-white/20 rounded-full h-0.5 mt-0.5">
          <div
            className="bg-white rounded-full h-0.5 transition-all duration-500"
            style={{ width: `${(currentRound / 12) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-2">
        {/* Block 1: Basic Points + Subtotal + Bonus */}
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm">
          {/* Headers */}
          <div className="flex bg-gradient-to-r from-gray-700 to-gray-800 dark:from-gray-800 dark:to-gray-900 text-white">
            <div className="w-[100px] p-1 text-center font-bold text-xs">组合</div>
            <div className={`flex-1 text-center p-1 font-bold text-xs transition-all duration-300 ${
              currentPlayer === 1 ? 'bg-blue-500' : ''
            }`}>
              玩家一
            </div>
            <div className={`flex-1 text-center p-1 font-bold text-xs border-l border-gray-600 transition-all duration-300 ${
              currentPlayer === 2 ? 'bg-purple-500' : ''
            }`}>
              玩家二
            </div>
          </div>

          {/* Upper Section */}
          {upperSectionCategories.map(({ key, name }) => (
            <div key={key} className="flex border-b border-gray-200 dark:border-gray-600 items-stretch">
              <div className="w-[100px] bg-blue-100 dark:bg-blue-800/30 p-0.5 flex items-center justify-center font-semibold text-xs h-11">
                {name}
              </div>
              <Cell player={1} category={key}>{renderScoreCell(1, key)}</Cell>
              <Cell player={2} category={key}>{renderScoreCell(2, key)}</Cell>
            </div>
          ))}

          {/* Subtotal */}
          <div className="flex border-b border-gray-200 dark:border-gray-600 items-stretch font-semibold bg-green-100 dark:bg-green-800/30">
            <div className="w-[100px] p-0.5 flex items-center justify-center text-xs h-11">小计</div>
            <div className="flex-1 p-0.5 text-center border-l border-gray-300 dark:border-gray-600 text-xs font-bold text-green-700 dark:text-green-400 h-11 flex items-center justify-center">
              {getUpperScore(1)}/63
            </div>
            <div className="flex-1 p-0.5 text-center border-l border-gray-300 dark:border-gray-600 text-xs font-bold text-green-700 dark:text-green-400 h-11 flex items-center justify-center">
              {getUpperScore(2)}/63
            </div>
          </div>

          {/* Bonus */}
          <div className="flex items-stretch font-semibold bg-amber-100 dark:bg-amber-800/30">
            <div className="w-[100px] p-0.5 flex items-center justify-center text-xs h-11">奖励+35</div>
            <div className="flex-1 p-0.5 text-center border-l border-gray-300 dark:border-gray-600 text-xs font-bold text-amber-700 dark:text-amber-400 h-11 flex items-center justify-center">
              {getUpperScore(1) >= 63 ? '35' : '0'}
            </div>
            <div className="flex-1 p-0.5 text-center border-l border-gray-300 dark:border-gray-600 text-xs font-bold text-amber-700 dark:text-amber-400 h-11 flex items-center justify-center">
              {getUpperScore(2) >= 63 ? '35' : '0'}
            </div>
          </div>
        </div>

        {/* Block 2: Chance */}
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm">
          <div className="flex items-stretch">
            <div className="w-[100px] bg-orange-100 dark:bg-orange-800/30 p-0.5 flex items-center justify-center font-semibold text-xs h-11">
              {chanceCategory.name}
            </div>
            <Cell player={1} category={chanceCategory.key}>{renderScoreCell(1, chanceCategory.key)}</Cell>
            <Cell player={2} category={chanceCategory.key}>{renderScoreCell(2, chanceCategory.key)}</Cell>
          </div>
        </div>

        {/* Block 3: Special Combinations */}
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm">
          {specialCategories.map(({ key, name }, index) => (
            <div key={key} className={`flex items-stretch ${index < specialCategories.length - 1 ? 'border-b border-gray-200 dark:border-gray-600' : ''}`}>
              <div className="w-[100px] bg-purple-100 dark:bg-purple-800/30 p-0.5 flex items-center justify-center font-semibold text-xs h-11">
                {name}
              </div>
              <Cell player={1} category={key}>{renderScoreCell(1, key)}</Cell>
              <Cell player={2} category={key}>{renderScoreCell(2, key)}</Cell>
            </div>
          ))}
        </div>
      </div>

      {/* Total Score */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 rounded-lg text-white font-bold shadow-lg h-16">
        <div className="flex items-stretch h-full">
          <div className="w-[100px] p-2 flex items-center justify-center text-xs">
            🏆 总计
          </div>
          <div className="flex-1 p-2 text-center flex items-center justify-center">
            <div className="text-lg font-bold">{getTotalScore(1)}</div>
          </div>
          <div className="flex-1 p-2 text-center border-l border-white/20 flex items-center justify-center">
            <div className="text-lg font-bold">{getTotalScore(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

Scoreboard.displayName = "Scoreboard";
export default Scoreboard; 