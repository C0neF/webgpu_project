'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faGamepad } from '@fortawesome/free-solid-svg-icons';
import DiceCanvas, { DiceCanvasHandle } from './components/DiceCanvas';
import Scoreboard from './components/Scoreboard';
import ThemeToggle from './components/ThemeToggle';
import { WebRTCManager, ConnectionInfo } from '../lib/webrtc-manager';

// 扩展Navigator接口以支持WebGPU
declare global {
  interface Navigator {
    gpu?: any;
  }
}

// 计分类型定义
export type ScoreCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'fullHouse' | 'fourOfKind' | 'smallStraight' | 'largeStraight' | 'yahtzee' | 'chance';

export interface ScoreCard {
  ones: number | null;
  twos: number | null;
  threes: number | null;
  fours: number | null;
  fives: number | null;
  sixes: number | null;
  fullHouse: number | null;
  fourOfKind: number | null;
  smallStraight: number | null;
  largeStraight: number | null;
  yahtzee: number | null;
  chance: number | null;
}

const initialScoreCard: ScoreCard = {
  ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null,
  fullHouse: null, fourOfKind: null, smallStraight: null, largeStraight: null, yahtzee: null, chance: null
};

type Player = 1 | 2;

interface GameUIProps {
  onBackToLobby?: () => void;
  roomId?: string;
  webrtcManager?: WebRTCManager;
  connectionInfo?: ConnectionInfo;
}

function GameUI({ onBackToLobby, roomId, webrtcManager, connectionInfo }: GameUIProps) {
  const diceCanvasRef = useRef<DiceCanvasHandle>(null);
  const [rendererType, setRendererType] = useState<string>('检测中...');
  const [isClient, setIsClient] = useState<boolean>(false);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [currentFaces, setCurrentFaces] = useState<number[]>([1, 1, 1, 1, 1]);
  const [selectedDice, setSelectedDice] = useState<boolean[]>([false, false, false, false, false]);

  // 双人游戏状态
  const [currentPlayer, setCurrentPlayer] = useState<Player>(1);
  const [scoreCards, setScoreCards] = useState({
    player1: initialScoreCard,
    player2: initialScoreCard
  });
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [rollsLeft, setRollsLeft] = useState<number>(3);
  const [rollDuration, setRollDuration] = useState<number>(5);
  const [myRollDuration, setMyRollDuration] = useState<number>(5); // 自己的时间设置
  const [opponentRollDuration, setOpponentRollDuration] = useState<number>(5); // 对手的时间设置
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [opponentReady, setOpponentReady] = useState<boolean>(false);
  const [myPlayerNumber, setMyPlayerNumber] = useState<Player | null>(null);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const myPlayerNumberRef = useRef<Player | null>(null);
  const [opponentAction, setOpponentAction] = useState<string>('idle');
  const [opponentSelectedDice, setOpponentSelectedDice] = useState<boolean[]>([false, false, false, false, false]);
  const opponentActionRef = useRef<string>('idle');
  const opponentSelectedDiceRef = useRef<boolean[]>([false, false, false, false, false]);
  const [opponentCurrentFaces, setOpponentCurrentFaces] = useState<number[]>([1, 1, 1, 1, 1]);
  const [opponentRollsLeft, setOpponentRollsLeft] = useState<number>(3);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 监听WebRTC连接状态变化和设置玩家角色
  useEffect(() => {
    if (webrtcManager && connectionInfo) {
      // 根据角色分配玩家编号
      const playerNumber: Player = connectionInfo.playerRole === 'host' ? 1 : 2;
      setMyPlayerNumber(playerNumber);
      myPlayerNumberRef.current = playerNumber;

      // 设置初始回合（玩家1先开始）
      setIsMyTurn(playerNumber === 1);

      // 设置准备状态回调
      webrtcManager.onPlayerReady((readyState) => {
        setOpponentReady(readyState.isReady);

        // 如果双方都准备好了，开始游戏或继续下一轮
        if (readyState.isReady && isReady && !gameStarted) {
          startGame();
        }
      });
    }
  }, [webrtcManager, connectionInfo, isReady, gameStarted]);

  // 设置WebRTC事件监听
  useEffect(() => {
    if (webrtcManager) {
      console.log('GameUI - 设置WebRTC事件监听');

      // 监听骰子投掷（现在主要用于备份同步，因为动画已在投掷开始时触发）
      webrtcManager.onDiceRoll((roll) => {
        console.log('收到对手骰子投掷结果（备份）:', roll);
        // 这里可以用于验证结果一致性或处理异常情况
        if (roll.playerId !== webrtcManager.getSelfId()) {
          console.log('对手最终投掷结果:', roll.diceValues);
        }
      });

      // 监听骰子选择状态
      webrtcManager.onDiceSelection((selection) => {
        console.log('收到对手骰子选择:', selection);
        if (selection.playerId !== webrtcManager.getSelfId()) {
          setOpponentSelectedDice(selection.selectedDice);
          opponentSelectedDiceRef.current = selection.selectedDice;
        }
      });

      // 监听投掷开始
      webrtcManager.onDiceRollStart((rollStart) => {
        console.log('收到对手投掷开始:', rollStart);
        if (rollStart.playerId !== webrtcManager.getSelfId()) {
          // 设置对手正在投掷状态
          setOpponentAction('rolling');
          opponentActionRef.current = 'rolling';
          setOpponentSelectedDice(rollStart.selectedDice);
          opponentSelectedDiceRef.current = rollStart.selectedDice;

          console.log('立即播放对手投掷动画，结果:', rollStart.results);

          // 立即播放对手的投掷动画
          if (diceCanvasRef.current) {
            diceCanvasRef.current.rollWithResults({
              selectedDice: rollStart.selectedDice,
              duration: rollStart.duration,
              results: rollStart.results
            }).then(() => {
              console.log('对手投掷动画完成');
              setOpponentAction('idle');
              opponentActionRef.current = 'idle';
            }).catch((error) => {
              console.error('对手投掷动画失败:', error);
              setOpponentAction('idle');
              opponentActionRef.current = 'idle';
            });
          }
        }
      });

      // 监听玩家动作
      webrtcManager.onPlayerAction((action) => {
        console.log('收到对手动作:', action);
        if (action.playerId !== webrtcManager.getSelfId()) {
          setOpponentAction(action.action);
          opponentActionRef.current = action.action;
        }
      });

      // 监听时间更新（对手投掷时的时间）
      webrtcManager.onDurationUpdate((durationUpdate) => {
        console.log('收到对手投掷时间:', durationUpdate);
        if (durationUpdate.playerId !== webrtcManager.getSelfId()) {
          // 只有在对手回合时才更新显示的时间
          if (!isMyTurn) {
            setRollDuration(durationUpdate.duration);
          }
          // 总是更新对手的时间记录
          setOpponentRollDuration(durationUpdate.duration);
        }
      });

      // 监听分数选项更新
      webrtcManager.onScoreOptions((scoreOptions) => {
        console.log('收到对手分数选项:', scoreOptions);
        if (scoreOptions.playerId !== webrtcManager.getSelfId()) {
          setOpponentCurrentFaces(scoreOptions.currentFaces);
          setOpponentRollsLeft(scoreOptions.rollsLeft);
        }
      });

      // 监听分数更新
      webrtcManager.onScoreUpdate((update) => {
        console.log('收到对手分数更新:', update);
        // 同步对手的分数到计分板
        if (update.playerId !== webrtcManager.getSelfId()) {
          const currentMyPlayerNumber = myPlayerNumberRef.current;
          if (currentMyPlayerNumber) {
            const opponentPlayerNumber: Player = currentMyPlayerNumber === 1 ? 2 : 1;
            const playerKey = `player${opponentPlayerNumber}` as const;

            setScoreCards(prev => ({
              ...prev,
              [playerKey]: {
                ...prev[playerKey],
                [update.category as ScoreCategory]: update.score
              }
            }));
          }
        }
      });

      // 监听游戏状态
      webrtcManager.onGameState((state) => {
        console.log('收到游戏状态更新:', state);
        // 同步游戏状态
        setCurrentPlayer(state.currentPlayer);
        setCurrentRound(state.currentRound);
        setRollsLeft(state.rollsLeft);

        // 使用ref中的最新值来计算isMyTurn
        const currentMyPlayerNumber = myPlayerNumberRef.current;
        if (currentMyPlayerNumber) {
          setIsMyTurn(currentMyPlayerNumber === state.currentPlayer);
        }

        // 处理回合切换时的时间更新
        const newIsMyTurn = currentMyPlayerNumber === state.currentPlayer;
        if (newIsMyTurn !== isMyTurn) {
          // 回合切换了，清理骰子状态
          setSelectedDice([false, false, false, false, false]);
          setOpponentSelectedDice([false, false, false, false, false]);
          setCurrentFaces([1, 1, 1, 1, 1]);
          setOpponentCurrentFaces([1, 1, 1, 1, 1]);

          // 强制重置骰子到1点
          setTimeout(() => {
            diceCanvasRef.current?.reset();
            diceCanvasRef.current?.setDiceResults([1, 1, 1, 1, 1]);
          }, 0);

          if (newIsMyTurn) {
            // 轮到自己，恢复自己的时间设置并可以调整
            setRollDuration(myRollDuration);
          }
          // 如果轮到对手，保持当前显示的时间（对手投掷时会更新）
        }

        // 处理游戏阶段变化
        if (state.gamePhase === 'waiting') {
          // 回合结束，进入准备状态
          setGameStarted(false);
          setIsReady(false);
          setOpponentReady(false);
          setIsMyTurn(false);
        } else if (state.gamePhase === 'finished' && state.winner) {
          // 游戏完全结束
          const p1Score = getTotalScore(1);
          const p2Score = getTotalScore(2);
          const winnerText = state.winner === currentMyPlayerNumber ? '你获胜了！' : '对手获胜了！';
          alert(`游戏结束!\n玩家一: ${p1Score}分\n玩家二: ${p2Score}分\n${winnerText}`);

          // 重置游戏状态
          setGameStarted(false);
          setIsReady(false);
          setOpponentReady(false);
          setCurrentPlayer(1);
          setCurrentRound(1);
          setRollsLeft(3);
          setSelectedDice([false, false, false, false, false]);
          setOpponentSelectedDice([false, false, false, false, false]);
          setCurrentFaces([1, 1, 1, 1, 1]);
          setOpponentCurrentFaces([1, 1, 1, 1, 1]);
          setIsMyTurn(false);

          // 重置计分板
          setScoreCards({
            player1: initialScoreCard,
            player2: initialScoreCard
          });

          // 强制重置骰子到1点
          setTimeout(() => {
            diceCanvasRef.current?.reset();
            diceCanvasRef.current?.setDiceResults([1, 1, 1, 1, 1]);
          }, 0);
        }
      });

      return () => {
        // 清理事件监听
        webrtcManager.onDiceRoll(() => {});
        webrtcManager.onScoreUpdate(() => {});
        webrtcManager.onGameState(() => {});
      };
    }
  }, [webrtcManager]);

  const calculateScore = (category: ScoreCategory, faces: number[]): number => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    faces.forEach(face => counts[face]++);
    switch (category) {
      case 'ones': return counts[1] * 1;
      case 'twos': return counts[2] * 2;
      case 'threes': return counts[3] * 3;
      case 'fours': return counts[4] * 4;
      case 'fives': return counts[5] * 5;
      case 'sixes': return counts[6] * 6;
      case 'fullHouse':
        const hasThree = counts.some(count => count === 3);
        const hasTwo = counts.some(count => count === 2);
        return hasThree && hasTwo ? faces.reduce((sum, face) => sum + face, 0) : 0;
      case 'fourOfKind':
        const hasFour = counts.some(count => count >= 4);
        return hasFour ? faces.reduce((sum, face) => sum + face, 0) : 0;
      case 'smallStraight':
        const uniqueFaces = Array.from(new Set(faces));
        const straights = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
        return straights.some(s => s.every(n => uniqueFaces.includes(n))) ? 15 : 0;
      case 'largeStraight':
        const uniqueFacesStr = Array.from(new Set(faces)).sort().join('');
        return uniqueFacesStr.includes('12345') || uniqueFacesStr.includes('23456') ? 30 : 0;
      case 'yahtzee':
        return counts.some(count => count === 5) ? 50 : 0;
      case 'chance':
        return faces.reduce((sum, face) => sum + face, 0);
      default: return 0;
    }
  };

  const getTotalScore = (player: Player) => {
    const scoreCard = player === 1 ? scoreCards.player1 : scoreCards.player2;
    const allScores = Object.values(scoreCard);
    const total = allScores.reduce((sum, score) => sum + (score || 0), 0);
    const upperScore = (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as ScoreCategory[])
        .reduce((sum, category) => sum + (scoreCard[category] || 0), 0);
    const bonus = upperScore >= 63 ? 35 : 0;
    return total + bonus;
  };

  const handleScoreSelect = (category: ScoreCategory) => {
    // 只有轮到自己才能选择分数
    if (!isMyTurn || !myPlayerNumber) return;

    const playerKey = `player${myPlayerNumber}` as const;
    if (scoreCards[playerKey][category] !== null || rollsLeft === 3) return;

    const score = calculateScore(category, currentFaces);
    setScoreCards(prev => ({
      ...prev,
      [playerKey]: {
        ...prev[playerKey],
        [category]: score
      }
    }));

    // 发送分数更新给对手
    if (webrtcManager) {
      webrtcManager.sendScoreUpdateData(category, score);
      webrtcManager.sendPlayerActionData('idle');
    }

    // 切换玩家
    const nextPlayer = currentPlayer === 1 ? 2 : 1;
    const newRollsLeft = 3;
    let newRound = currentRound;

    // 如果玩家2完成了他的回合，进入下一轮或结束游戏
    if (currentPlayer === 2) {
      if (currentRound < 12) {
        newRound = currentRound + 1;
        // 回合结束，重置为准备状态
        setGameStarted(false);
        setIsReady(false);
        setOpponentReady(false);

        // 发送回合结束状态
        if (webrtcManager) {
          webrtcManager.sendGameStateData({
            currentPlayer: 1, // 下一轮从玩家1开始
            currentRound: newRound,
            rollsLeft: 3,
            gamePhase: 'waiting'
          });
        }

        // 更新本地状态但不开始游戏
        setCurrentPlayer(1);
        setCurrentRound(newRound);
        setRollsLeft(3);
        setSelectedDice([false, false, false, false, false]);
        setOpponentSelectedDice([false, false, false, false, false]);
        setCurrentFaces([1, 1, 1, 1, 1]);
        setOpponentCurrentFaces([1, 1, 1, 1, 1]);
        setIsMyTurn(false); // 等待准备状态

        // 强制重置骰子到1点
        setTimeout(() => {
          diceCanvasRef.current?.reset();
          diceCanvasRef.current?.setDiceResults([1, 1, 1, 1, 1]);
        }, 0);

        return;
      } else {
        // 游戏结束
        const p1Score = getTotalScore(1);
        const p2Score = getTotalScore(2);
        const winner: Player = p1Score > p2Score ? 1 : p2Score > p1Score ? 2 : 1; // 平局时默认玩家1获胜

        // 发送游戏结束状态
        if (webrtcManager) {
          webrtcManager.sendGameStateData({
            currentPlayer: nextPlayer,
            currentRound: newRound,
            rollsLeft: newRollsLeft,
            gamePhase: 'finished',
            winner: winner
          });
        }

        const winnerText = winner === myPlayerNumber ? '你获胜了！' : '对手获胜了！';
        alert(`游戏结束!\n玩家一: ${p1Score}分\n玩家二: ${p2Score}分\n${winnerText}`);

        // 游戏结束后重置为准备状态
        setGameStarted(false);
        setIsReady(false);
        setOpponentReady(false);
        setCurrentPlayer(1);
        setCurrentRound(1);
        setRollsLeft(3);
        setSelectedDice([false, false, false, false, false]);
        setOpponentSelectedDice([false, false, false, false, false]);
        setCurrentFaces([1, 1, 1, 1, 1]);
        setOpponentCurrentFaces([1, 1, 1, 1, 1]);
        setIsMyTurn(false);

        // 重置计分板
        setScoreCards({
          player1: initialScoreCard,
          player2: initialScoreCard
        });

        // 强制重置骰子到1点
        setTimeout(() => {
          diceCanvasRef.current?.reset();
          diceCanvasRef.current?.setDiceResults([1, 1, 1, 1, 1]);
        }, 0);

        return;
      }
    }

    // 更新本地状态
    setCurrentPlayer(nextPlayer);
    setCurrentRound(newRound);
    setRollsLeft(newRollsLeft);
    setSelectedDice([false, false, false, false, false]);
    setOpponentSelectedDice([false, false, false, false, false]);
    setCurrentFaces([1, 1, 1, 1, 1]);
    setOpponentCurrentFaces([1, 1, 1, 1, 1]);
    setIsMyTurn(myPlayerNumber === nextPlayer);

    // 强制重置骰子到1点
    setTimeout(() => {
      diceCanvasRef.current?.reset();
      diceCanvasRef.current?.setDiceResults([1, 1, 1, 1, 1]);
    }, 0);

    // 发送游戏状态更新给对手
    if (webrtcManager) {
      webrtcManager.sendGameStateData({
        currentPlayer: nextPlayer,
        currentRound: newRound,
        rollsLeft: newRollsLeft,
        gamePhase: 'playing'
      });
    }
  };

  const resetGame = () => {
    setCurrentRound(1);
    setRollsLeft(3);
    setSelectedDice([false, false, false, false, false]);
    setOpponentSelectedDice([false, false, false, false, false]);
    setCurrentFaces([1, 1, 1, 1, 1]);
    setOpponentCurrentFaces([1, 1, 1, 1, 1]);
    setScoreCards({
      player1: initialScoreCard,
      player2: initialScoreCard
    });
    setCurrentPlayer(1);
    setGameStarted(false);
    setIsReady(false);
    setOpponentReady(false);
    setIsMyTurn(myPlayerNumberRef.current === 1); // 重置回合状态

    // 强制重置骰子到1点
    setTimeout(() => {
      diceCanvasRef.current?.reset();
      diceCanvasRef.current?.setDiceResults([1, 1, 1, 1, 1]);
    }, 0);

    // 发送游戏重置状态给对手
    if (webrtcManager) {
      webrtcManager.sendGameStateData({
        currentPlayer: 1,
        currentRound: 1,
        rollsLeft: 3,
        gamePhase: 'waiting'
      });
    }
  };

  const rollDice = async () => {
    // 只有轮到自己且游戏已开始才能投掷
    if (isRolling || rollsLeft === 0 || !diceCanvasRef.current || !gameStarted || !isMyTurn) return;

    setIsRolling(true);
    const newRollsLeft = rollsLeft - 1;
    setRollsLeft(newRollsLeft);

    // 预计算投掷结果
    const preCalculatedResults = preCalculateDiceResults(selectedDice);

    // 立即发送投掷开始消息给对手，包含预计算的结果
    if (webrtcManager) {
      webrtcManager.sendDiceRollStartData(selectedDice, rollDuration * 1000, 3 - newRollsLeft, preCalculatedResults);
      webrtcManager.sendPlayerActionData('rolling');
      // 发送当前使用的时间给对手显示
      webrtcManager.sendDurationUpdateData(rollDuration);
    }

    // 使用预计算的结果播放动画
    const updatedFaces = [...currentFaces];
    preCalculatedResults.forEach((face, index) => {
      if (face !== -1) {
        updatedFaces[index] = face;
      }
    });

    // 播放动画到预计算的结果
    await diceCanvasRef.current.rollWithResults({
      selectedDice,
      duration: rollDuration * 1000,
      results: updatedFaces
    });

    setCurrentFaces(updatedFaces);
    setIsRolling(false);

    // 发送动作完成状态和分数选项
    if (webrtcManager) {
      webrtcManager.sendPlayerActionData('idle');
      // 发送当前的骰子状态，让对手看到可选择的分数
      webrtcManager.sendScoreOptionsData(updatedFaces, newRollsLeft);
    }
  };

  const handleReady = () => {
    if (gameStarted) return;

    const newReadyState = !isReady;
    setIsReady(newReadyState);

    // 通过WebRTC发送准备状态
    if (webrtcManager) {
      webrtcManager.sendReady(newReadyState);
    }

    // 检查是否双方都准备好了
    if (newReadyState && opponentReady) {
      startGame();
    }
  };

  const startGame = () => {
    setGameStarted(true);

    // 如果是新游戏，重置到第1轮；如果是继续游戏，保持当前轮数
    const isNewGame = currentRound === 1 && Object.values(scoreCards.player1).every(score => score === null);
    if (isNewGame) {
      setCurrentPlayer(1);
      setCurrentRound(1);
    }
    // 否则保持当前的currentPlayer和currentRound

    setRollsLeft(3);
    const newIsMyTurn = myPlayerNumberRef.current === currentPlayer;
    setIsMyTurn(newIsMyTurn);

    // 设置初始时间显示
    if (newIsMyTurn) {
      // 轮到自己，显示自己的时间设置
      setRollDuration(myRollDuration);
    }
    // 如果轮到对手，保持当前时间显示，等待对手投掷时更新

    // 发送游戏开始状态给对手
    if (webrtcManager) {
      webrtcManager.sendGameStateData({
        currentPlayer: currentPlayer,
        currentRound: currentRound,
        rollsLeft: 3,
        gamePhase: 'playing'
      });
    }
  };

  // 处理骰子选择变化
  const handleDiceSelectionChange = (newSelectedDice: boolean[]) => {
    if (webrtcManager && isMyTurn) {
      webrtcManager.sendDiceSelectionData(newSelectedDice);
      webrtcManager.sendPlayerActionData('selecting');
    }
  };

  // 处理时间调整（只更新本地，不立即同步）
  const handleDurationChange = (newDuration: number) => {
    if (isMyTurn) {
      setMyRollDuration(newDuration);
      setRollDuration(newDuration);
      // 不再立即发送给对手，而是在投掷时发送
    }
  };

  // 获取对手动作文本
  const getOpponentActionText = () => {
    switch (opponentAction) {
      case 'rolling':
        return '正在投掷骰子...';
      case 'selecting':
        return '正在选择骰子...';
      default:
        return '等待对手操作';
    }
  };

  // 预计算骰子结果
  const preCalculateDiceResults = (selectedDice: boolean[]): number[] => {
    return selectedDice.map((isSelected) => {
      if (isSelected) {
        // 选中的骰子保持当前值
        return -1; // 表示不变
      } else {
        // 未选中的骰子生成新的随机值
        return Math.floor(Math.random() * 6) + 1;
      }
    });
  };

  // 复制房间号到剪贴板
  const copyRoomId = async () => {
    if (roomId) {
      try {
        await navigator.clipboard.writeText(roomId);
        alert('房间号已复制到剪贴板！');
      } catch (err) {
        console.error('复制失败:', err);
        // 降级方案：选择文本
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('房间号已复制到剪贴板！');
      }
    }
  };

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white p-4 font-sans transition-colors duration-300 overflow-hidden flex flex-col">
      <header className="text-center relative">
        {/* 返回按钮 */}
        {onBackToLobby && (
          <button
            onClick={onBackToLobby}
            className="absolute left-0 top-0 w-10 h-10 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors flex items-center justify-center shadow-lg"
          >
            ←
          </button>
        )}
        <div className="absolute top-0 right-0">
          <ThemeToggle />
        </div>
      </header>



      <main className="flex justify-center items-center flex-1 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-[4fr_1.5fr] gap-4 h-[85vh] max-w-[100rem] w-full">
        {/* 左侧：骰子游戏区域 */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-3 flex flex-col justify-start shadow-lg border border-gray-200 dark:border-white/10">
          <div className='bg-gray-200 dark:bg-gray-900/70 rounded-lg overflow-hidden w-full aspect-[5/3]'>
            {isClient && (
              <DiceCanvas
                ref={diceCanvasRef}
                isRolling={isRolling}
                selectedDice={isMyTurn ? selectedDice : opponentSelectedDice}
                setSelectedDice={setSelectedDice}
                setRendererType={setRendererType}
                rollsLeft={rollsLeft}
                isMyTurn={isMyTurn}
                onDiceSelectionChange={handleDiceSelectionChange}
              />
            )}
          </div>
          <div className="flex flex-col items-center justify-center gap-4 flex-1">
            <div className="flex items-center gap-2 w-full max-w-sm px-2">
              <label
                htmlFor="duration-slider"
                className={`text-sm font-medium ${
                  isMyTurn
                    ? 'text-gray-700 dark:text-gray-300'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                时间: {!isMyTurn && '(对手设置)'}
              </label>
              <input
                type="range"
                id="duration-slider"
                min="1"
                max="10"
                step="1"
                value={rollDuration}
                onChange={(e) => handleDurationChange(parseInt(e.target.value))}
                disabled={!isMyTurn}
                className={`flex-1 h-2 rounded-lg appearance-none ${
                  isMyTurn
                    ? 'bg-gray-200 dark:bg-gray-700 cursor-pointer'
                    : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed opacity-50'
                }`}
              />
              <span className={`text-sm font-semibold w-10 text-center ${
                isMyTurn
                  ? 'text-gray-700 dark:text-gray-300'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {rollDuration}s
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={gameStarted ? rollDice : handleReady}
                disabled={gameStarted ? (isRolling || rollsLeft === 0 || !isMyTurn) : false}
                className={`px-4 py-2 rounded-lg font-bold text-white text-sm transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 ${
                  gameStarted
                    ? (isRolling || rollsLeft === 0 || !isMyTurn
                        ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                        : 'bg-indigo-500 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 active:bg-indigo-700')
                    : (isReady
                        ? 'bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-500'
                        : 'bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-500')
                }`}
              >
                {gameStarted
                  ? (isRolling
                      ? '🎲 旋转中...'
                      : !isMyTurn
                        ? '⏳ 等待对手'
                        : `🎲 投掷 (${rollsLeft})`)
                  : (isReady ? '✅ 已准备' : '🚀 准备')
                }
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：比分板 */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-3 shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden">
          <Scoreboard
            currentRound={currentRound}
            currentPlayer={currentPlayer}
            rollsLeft={rollsLeft}
            scoreCards={scoreCards}
            currentFaces={currentFaces}
            handleScoreSelect={handleScoreSelect}
            calculateScore={calculateScore}
            getTotalScore={getTotalScore}
            isRolling={isRolling}
            isMyTurn={isMyTurn}
            myPlayerNumber={myPlayerNumber}
            opponentCurrentFaces={opponentCurrentFaces}
            opponentRollsLeft={opponentRollsLeft}
          />
        </div>
        </div>
      </main>

      {/* 底部房间号显示 */}
      {roomId && (
        <div className="mt-4 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-2 shadow-lg border border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700/50 px-3 py-1.5 rounded-lg text-xs">
            {/* 玩家身份和房间号 */}
            <div className="flex items-center gap-1.5">
              {/* 玩家身份 */}
              {connectionInfo && (
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
                  connectionInfo.gamePlayerNumber === 1
                    ? 'bg-blue-500'
                    : connectionInfo.gamePlayerNumber === 2
                      ? 'bg-red-500'
                      : connectionInfo.playerRole === 'host'
                        ? 'bg-blue-500'
                        : 'bg-red-500'
                }`}>
                  P{connectionInfo.gamePlayerNumber || (connectionInfo.playerRole === 'host' ? 1 : 2)}
                </span>
              )}
              <span className="text-gray-600 dark:text-gray-300">房间:</span>
              <span className="font-mono font-bold text-gray-800 dark:text-white">{roomId}</span>
              <button
                onClick={copyRoomId}
                className="px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors duration-200"
                title="复制房间号"
              >
                📋
              </button>
            </div>

            {/* 游戏准备状态 */}
            {!gameStarted && (
              <div className="flex items-center gap-1.5 border-l border-gray-300 dark:border-gray-600 pl-3">
                <span className="text-gray-600 dark:text-gray-300">准备状态:</span>
                <span className={`font-semibold ${isReady ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  {isReady ? '已准备' : '未准备'}
                </span>
                <span className="text-gray-600 dark:text-gray-300">|</span>
                <span className="text-gray-600 dark:text-gray-300">对手:</span>
                <span className={`font-semibold ${opponentReady ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  {opponentReady ? '已准备' : '未准备'}
                </span>
              </div>
            )}

            {/* 连接状态 */}
            {connectionInfo && (
              <div className="flex items-center gap-1.5 border-l border-gray-300 dark:border-gray-600 pl-3">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  connectionInfo.peerConnected
                    ? 'bg-green-500'
                    : connectionInfo.isConnected
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}></div>
                <span className="text-gray-800 dark:text-white">
                  {connectionInfo.peerConnected
                    ? '已连接'
                    : connectionInfo.isConnected
                      ? '等待中'
                      : '未连接'}
                </span>
              </div>
            )}
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

// 前置页面组件
interface LobbyPageProps {
  onEnterGame: (roomId: string, webrtcManager: WebRTCManager, connectionInfo: ConnectionInfo) => void;
}

const LobbyPage = ({ onEnterGame }: LobbyPageProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const [containerExpanding, setContainerExpanding] = useState(false);
  const [showInputContent, setShowInputContent] = useState(false);

  const handleCreateRoom = async () => {
    setIsConnecting(true);
    setConnectionStatus('正在创建房间...');

    try {
      const webrtcManager = new WebRTCManager();

      // 设置连接状态回调
      webrtcManager.onConnectionChange((info: ConnectionInfo) => {
        console.log('连接状态变化:', info);
        // 房间创建成功后直接进入游戏界面
        if (info.isConnected) {
          setIsConnecting(false);
          onEnterGame(info.roomId, webrtcManager, info);
        }
      });

      webrtcManager.onError((error: string) => {
        console.error('WebRTC错误:', error);
        setConnectionStatus('连接失败: ' + error);
        setIsConnecting(false);
      });

      const result = await webrtcManager.createRoom();
      if (!result.success) {
        setConnectionStatus('创建房间失败: ' + (result.error || '未知错误'));
        setIsConnecting(false);
      }
      // 成功时不显示任何消息，直接等待连接状态回调
    } catch (error) {
      console.error('创建房间异常:', error);
      setConnectionStatus('创建房间失败');
      setIsConnecting(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomIdInput.trim()) return;
    setIsConnecting(true);
    setConnectionStatus('正在加入房间...');

    try {
      const webrtcManager = new WebRTCManager();

      // 设置连接状态回调
      webrtcManager.onConnectionChange((info: ConnectionInfo) => {
        console.log('连接状态变化:', info);
        // 加入房间成功后直接进入游戏界面
        if (info.isConnected) {
          setConnectionStatus('已加入房间，进入游戏...');
          setTimeout(() => {
            setIsConnecting(false);
            onEnterGame(info.roomId, webrtcManager, info);
          }, 500);
        }
      });

      webrtcManager.onError((error: string) => {
        console.error('WebRTC错误:', error);
        setConnectionStatus('连接失败: ' + error);
        setIsConnecting(false);
      });

      const result = await webrtcManager.joinRoom(roomIdInput.trim().toUpperCase());
      if (result.success) {
        setConnectionStatus('已加入房间，正在进入游戏...');
      } else {
        setConnectionStatus('加入房间失败: ' + (result.error || '未知错误'));
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('加入房间异常:', error);
      setConnectionStatus('加入房间失败');
      setIsConnecting(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: 'linear-gradient(135deg, #F8F6F0 0%, #F0EBDC 50%, #E8E0D0 100%)'
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      {/* 右上角深色模式切换按钮 */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <motion.div
        className="p-12 rounded-2xl shadow-2xl text-center"
        style={{ backgroundColor: '#D4B896' }}
        initial={{ opacity: 0, scale: 0.5, rotateY: 180 }}
        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
        transition={{
          duration: 1.2,
          ease: "easeOut",
          type: "spring",
          stiffness: 100
        }}
      >
        {/* 标题 */}
        <motion.h1
          className="text-4xl font-bold text-gray-800 mb-8"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          快艇骰子
        </motion.h1>

        {/* 连接状态显示 */}
        {connectionStatus && (
          <motion.div
            className="mb-6 p-3 bg-blue-100 border border-blue-300 rounded-lg"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-blue-800 text-sm font-medium">{connectionStatus}</p>
          </motion.div>
        )}

        {/* 按钮组 */}
        <motion.div
          className="flex flex-col gap-6 w-80"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          <motion.button
            onClick={handleCreateRoom}
            disabled={isConnecting}
            className={`px-8 py-4 text-white rounded-xl font-semibold text-lg shadow-lg transition-all duration-300 ${
              isConnecting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500'
            }`}
            whileHover={!isConnecting ? {
              scale: 1.05,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
            } : {}}
            whileTap={!isConnecting ? { scale: 0.95 } : {}}
          >
            <FontAwesomeIcon icon={faUsers} className="mr-2" />
            {isConnecting ? '创建中...' : '🏠 创建房间'}
          </motion.button>

          <motion.button
            onClick={() => {
              if (!isConnecting && !containerExpanding) {
                if (!showJoinInput) {
                  // 开始展开容器
                  setContainerExpanding(true);
                  setShowJoinInput(true);
                  setShowInputContent(false);
                } else {
                  // 收起容器
                  setShowInputContent(false);
                  setTimeout(() => {
                    setShowJoinInput(false);
                    setContainerExpanding(false);
                  }, 300);
                }
              }
            }}
            disabled={isConnecting || containerExpanding}
            className={`px-8 py-4 text-white rounded-xl font-semibold text-lg shadow-lg transition-all duration-300 ${
              isConnecting || containerExpanding
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
            whileHover={!isConnecting && !containerExpanding ? {
              scale: 1.05,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
            } : {}}
            whileTap={!isConnecting && !containerExpanding ? { scale: 0.95 } : {}}
          >
            <FontAwesomeIcon icon={faGamepad} className="mr-2" />
            🚪 加入房间
          </motion.button>

          {/* 加入房间输入框 */}
          {showJoinInput && (
            <motion.div
              className="flex flex-col gap-3"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              onAnimationComplete={() => {
                if (showJoinInput && !showInputContent) {
                  setShowInputContent(true);
                  setContainerExpanding(false);
                }
              }}
            >
              {showInputContent && (
                <motion.div
                  className="flex flex-col gap-3"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <input
                    type="text"
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    placeholder="输入房间号"
                    className="px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-gray-800 text-center font-semibold text-lg"
                    maxLength={6}
                  />
                  <motion.button
                    onClick={handleJoinRoom}
                    disabled={isConnecting || !roomIdInput.trim()}
                    className={`px-6 py-3 text-white rounded-lg font-semibold transition-all duration-300 ${
                      isConnecting || !roomIdInput.trim()
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500'
                    }`}
                    whileHover={!isConnecting && roomIdInput.trim() ? { scale: 1.02 } : {}}
                    whileTap={!isConnecting && roomIdInput.trim() ? { scale: 0.98 } : {}}
                  >
                    {isConnecting ? '加入中...' : '确认加入'}
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default function Home() {
  const [currentPage, setCurrentPage] = useState<'lobby' | 'game'>('lobby');
  const [roomId, setRoomId] = useState<string>('');
  const [webrtcManager, setWebrtcManager] = useState<WebRTCManager | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);

  const handleEnterGame = (newRoomId: string, manager: WebRTCManager, info: ConnectionInfo) => {
    setRoomId(newRoomId);
    setWebrtcManager(manager);
    setConnectionInfo(info);

    // 设置连接状态监听，实时更新connectionInfo
    manager.onConnectionChange((updatedInfo: ConnectionInfo) => {
      console.log('主组件 - 连接状态更新:', updatedInfo);
      setConnectionInfo(updatedInfo);
      // 强制触发重新渲染
      setForceUpdate(prev => prev + 1);
    });

    setCurrentPage('game');
  };

  const handleBackToLobby = () => {
    // 断开WebRTC连接
    if (webrtcManager) {
      webrtcManager.disconnect();
    }
    setCurrentPage('lobby');
    setRoomId('');
    setWebrtcManager(null);
    setConnectionInfo(null);
  };

  if (currentPage === 'lobby') {
    return <LobbyPage onEnterGame={handleEnterGame} />;
  }

  return (
    <GameUI
      onBackToLobby={handleBackToLobby}
      roomId={roomId}
      webrtcManager={webrtcManager || undefined}
      connectionInfo={connectionInfo || undefined}
    />
  );
}
