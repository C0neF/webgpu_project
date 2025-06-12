import { joinRoom } from 'trystero/torrent';

// 游戏数据接口
export interface DiceRoll {
  playerId: string;
  diceValues: number[];
  selectedDice: boolean[];
  rollNumber: number;
  timestamp: number;
}

export interface ScoreUpdate {
  playerId: string;
  category: string;
  score: number;
  timestamp: number;
}

export interface GameState {
  currentPlayer: 1 | 2;
  currentRound: number;
  rollsLeft: number;
  gamePhase: 'waiting' | 'playing' | 'finished';
  winner?: 1 | 2;
}

export interface PlayerReadyState {
  playerId: string;
  isReady: boolean;
  timestamp: number;
}

export interface DiceSelectionUpdate {
  playerId: string;
  selectedDice: boolean[];
  timestamp: number;
}

export interface DiceRollStart {
  playerId: string;
  selectedDice: boolean[];
  duration: number;
  rollNumber: number;
  results: number[]; // 预计算的投掷结果
  timestamp: number;
}

export interface PlayerAction {
  playerId: string;
  action: 'rolling' | 'selecting' | 'idle';
  timestamp: number;
}

export interface DurationUpdate {
  playerId: string;
  duration: number;
  timestamp: number;
}

export interface ScoreOptionsUpdate {
  playerId: string;
  currentFaces: number[];
  rollsLeft: number;
  timestamp: number;
}

export interface ConnectionInfo {
  roomId: string;
  playerId: string;
  playerRole: 'host' | 'guest';
  isConnected: boolean;
  peerConnected: boolean;
  gamePlayerNumber?: 1 | 2;
  isReady: boolean;
  opponentReady: boolean;
}

export class WebRTCManager {
  private room: any = null;
  private roomId: string = '';
  private connectionInfo: ConnectionInfo | null = null;
  private selfId: string = '';
  private opponentPlayerId: string | null = null;
  
  // Trystero actions
  private sendDiceRoll: any = null;
  private sendScoreUpdate: any = null;
  private sendGameState: any = null;
  private sendPlayerReady: any = null;
  private sendDiceSelection: any = null;
  private sendDiceRollStart: any = null;
  private sendPlayerAction: any = null;
  private sendDurationUpdate: any = null;
  private sendScoreOptions: any = null;
  
  // 回调函数
  private onDiceRollCallback?: (roll: DiceRoll) => void;
  private onScoreUpdateCallback?: (update: ScoreUpdate) => void;
  private onGameStateCallback?: (state: GameState) => void;
  private onConnectionChangeCallback?: (info: ConnectionInfo) => void;
  private onPlayerReadyCallback?: (readyState: PlayerReadyState) => void;
  private onDiceSelectionCallback?: (selection: DiceSelectionUpdate) => void;
  private onDiceRollStartCallback?: (rollStart: DiceRollStart) => void;
  private onPlayerActionCallback?: (action: PlayerAction) => void;
  private onDurationUpdateCallback?: (duration: DurationUpdate) => void;
  private onScoreOptionsCallback?: (options: ScoreOptionsUpdate) => void;
  private onErrorCallback?: (error: string) => void;

  constructor() {
    // 生成唯一的玩家ID
    this.selfId = this.generatePlayerId();
  }

  // 生成玩家ID
  private generatePlayerId(): string {
    return 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // 生成房间ID
  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // 初始化Trystero房间
  private initializeRoom(roomId: string, isHost: boolean = false) {
    try {
      // 使用trystero加入房间
      this.room = joinRoom(
        { 
          appId: 'dice-webrtc-game',
        }, 
        roomId
      );

      this.roomId = roomId;

      // 设置连接信息
      this.connectionInfo = {
        roomId: roomId,
        playerId: this.selfId,
        playerRole: isHost ? 'host' : 'guest',
        isConnected: true,
        peerConnected: false,
        isReady: false,
        opponentReady: false
      };

      this.setupTrysteroActions();
      this.setupTrysteroEvents();
      
      console.log(`已${isHost ? '创建' : '加入'}房间: ${roomId}`);
      this.updateConnectionStatus();
      
    } catch (error) {
      console.error('初始化房间失败:', error);
      this.onErrorCallback?.('初始化房间失败');
    }
  }

  // 设置Trystero动作
  private setupTrysteroActions() {
    if (!this.room) return;

    // 骰子投掷动作
    const [sendRoll, getRoll] = this.room.makeAction('diceRoll');
    this.sendDiceRoll = sendRoll;
    getRoll((roll: DiceRoll, peerId: string) => {
      console.log('收到骰子投掷:', roll, 'from', peerId);
      this.onDiceRollCallback?.(roll);
    });

    // 分数更新动作
    const [sendScore, getScore] = this.room.makeAction('scoreUpdate');
    this.sendScoreUpdate = sendScore;
    getScore((update: ScoreUpdate, peerId: string) => {
      console.log('收到分数更新:', update, 'from', peerId);
      this.onScoreUpdateCallback?.(update);
    });

    // 游戏状态动作
    const [sendState, getState] = this.room.makeAction('gameState');
    this.sendGameState = sendState;
    getState((state: GameState, peerId: string) => {
      console.log('收到游戏状态:', state, 'from', peerId);
      this.onGameStateCallback?.(state);
    });

    // 玩家准备状态动作
    const [sendReady, getReady] = this.room.makeAction('ready');
    this.sendPlayerReady = sendReady;
    getReady((readyState: PlayerReadyState, peerId: string) => {
      console.log('收到准备状态:', readyState, 'from', peerId);
      this.handlePlayerReady(readyState);
    });

    // 骰子选择状态动作
    const [sendSelection, getSelection] = this.room.makeAction('diceSelect');
    this.sendDiceSelection = sendSelection;
    getSelection((selection: DiceSelectionUpdate, peerId: string) => {
      console.log('收到骰子选择:', selection, 'from', peerId);
      this.onDiceSelectionCallback?.(selection);
    });

    // 骰子投掷开始动作
    const [sendRollStart, getRollStart] = this.room.makeAction('rollStart');
    this.sendDiceRollStart = sendRollStart;
    getRollStart((rollStart: DiceRollStart, peerId: string) => {
      console.log('收到投掷开始:', rollStart, 'from', peerId);
      this.onDiceRollStartCallback?.(rollStart);
    });

    // 玩家动作状态
    const [sendAction, getAction] = this.room.makeAction('action');
    this.sendPlayerAction = sendAction;
    getAction((action: PlayerAction, peerId: string) => {
      console.log('收到玩家动作:', action, 'from', peerId);
      this.onPlayerActionCallback?.(action);
    });

    // 投掷时间更新
    const [sendDuration, getDuration] = this.room.makeAction('duration');
    this.sendDurationUpdate = sendDuration;
    getDuration((duration: DurationUpdate, peerId: string) => {
      console.log('收到时间更新:', duration, 'from', peerId);
      this.onDurationUpdateCallback?.(duration);
    });

    // 分数选项更新
    const [sendOptions, getOptions] = this.room.makeAction('scoreOpts');
    this.sendScoreOptions = sendOptions;
    getOptions((options: ScoreOptionsUpdate, peerId: string) => {
      console.log('收到分数选项:', options, 'from', peerId);
      this.onScoreOptionsCallback?.(options);
    });
  }

  // 设置Trystero事件
  private setupTrysteroEvents() {
    if (!this.room) return;

    // 监听玩家加入
    this.room.onPeerJoin((peerId: string) => {
      console.log('玩家加入:', peerId);
      setTimeout(() => {
        this.updateConnectionStatus();
      }, 1000);
    });

    // 监听玩家离开
    this.room.onPeerLeave((peerId: string) => {
      console.log('玩家离开:', peerId);
      this.updateConnectionStatus();
    });
  }

  // 创建房间
  async createRoom(): Promise<{ success: boolean; roomId?: string; error?: string }> {
    try {
      const roomId = this.generateRoomId();
      this.initializeRoom(roomId, true);

      setTimeout(() => {
        this.updateConnectionStatus();
      }, 500);

      return {
        success: true,
        roomId: roomId
      };
    } catch (error) {
      console.error('创建房间失败:', error);
      return {
        success: false,
        error: '创建房间失败'
      };
    }
  }

  // 加入房间
  async joinRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.initializeRoom(roomId, false);

      setTimeout(() => {
        this.updateConnectionStatus();
      }, 500);

      return {
        success: true
      };
    } catch (error) {
      console.error('加入房间失败:', error);
      return {
        success: false,
        error: '加入房间失败'
      };
    }
  }

  // 处理玩家准备状态
  private handlePlayerReady(readyState: PlayerReadyState) {
    if (this.connectionInfo) {
      if (readyState.playerId !== this.connectionInfo.playerId) {
        console.log('更新对手准备状态:', readyState.isReady);
        this.connectionInfo.opponentReady = readyState.isReady;

        if (!this.opponentPlayerId) {
          this.opponentPlayerId = readyState.playerId;
          console.log('记录对手玩家ID:', this.opponentPlayerId);
        }

        this.updateConnectionStatus();
      }

      this.onPlayerReadyCallback?.(readyState);
    }
  }

  // 发送骰子投掷
  sendDiceRollData(diceValues: number[], selectedDice: boolean[], rollNumber: number) {
    if (this.sendDiceRoll && this.connectionInfo) {
      const roll: DiceRoll = {
        playerId: this.connectionInfo.playerId,
        diceValues,
        selectedDice,
        rollNumber,
        timestamp: Date.now()
      };
      this.sendDiceRoll(roll);
    }
  }

  // 发送分数更新
  sendScoreUpdateData(category: string, score: number) {
    if (this.sendScoreUpdate && this.connectionInfo) {
      const update: ScoreUpdate = {
        playerId: this.connectionInfo.playerId,
        category,
        score,
        timestamp: Date.now()
      };
      this.sendScoreUpdate(update);
    }
  }

  // 发送游戏状态
  sendGameStateData(state: GameState) {
    if (this.sendGameState) {
      this.sendGameState(state);
    }
  }

  // 发送玩家准备状态
  sendReady(isReady: boolean) {
    if (this.connectionInfo) {
      this.connectionInfo.isReady = isReady;
      this.updateConnectionStatus();

      if (this.sendPlayerReady) {
        const readyState: PlayerReadyState = {
          playerId: this.connectionInfo.playerId,
          isReady: isReady,
          timestamp: Date.now()
        };

        this.sendPlayerReady(readyState);
      }
    }
  }

  // 发送骰子选择状态
  sendDiceSelectionData(selectedDice: boolean[]) {
    if (this.sendDiceSelection && this.connectionInfo) {
      const selection: DiceSelectionUpdate = {
        playerId: this.connectionInfo.playerId,
        selectedDice,
        timestamp: Date.now()
      };
      this.sendDiceSelection(selection);
    }
  }

  // 发送投掷开始
  sendDiceRollStartData(selectedDice: boolean[], duration: number, rollNumber: number, results: number[]) {
    if (this.sendDiceRollStart && this.connectionInfo) {
      const rollStart: DiceRollStart = {
        playerId: this.connectionInfo.playerId,
        selectedDice,
        duration,
        rollNumber,
        results,
        timestamp: Date.now()
      };
      this.sendDiceRollStart(rollStart);
    }
  }

  // 发送玩家动作状态
  sendPlayerActionData(action: 'rolling' | 'selecting' | 'idle') {
    if (this.sendPlayerAction && this.connectionInfo) {
      const playerAction: PlayerAction = {
        playerId: this.connectionInfo.playerId,
        action,
        timestamp: Date.now()
      };
      this.sendPlayerAction(playerAction);
    }
  }

  // 发送投掷时间更新
  sendDurationUpdateData(duration: number) {
    if (this.sendDurationUpdate && this.connectionInfo) {
      const durationUpdate: DurationUpdate = {
        playerId: this.connectionInfo.playerId,
        duration,
        timestamp: Date.now()
      };
      this.sendDurationUpdate(durationUpdate);
    }
  }

  // 发送分数选项更新
  sendScoreOptionsData(currentFaces: number[], rollsLeft: number) {
    if (this.sendScoreOptions && this.connectionInfo) {
      const scoreOptions: ScoreOptionsUpdate = {
        playerId: this.connectionInfo.playerId,
        currentFaces,
        rollsLeft,
        timestamp: Date.now()
      };
      this.sendScoreOptions(scoreOptions);
    }
  }

  // 更新连接状态
  private updateConnectionStatus() {
    if (this.connectionInfo) {
      const peers = this.room ? this.room.getPeers() : {};
      const peerIds = Object.keys(peers);

      // 创建新的连接信息对象，确保React能检测到变化
      const updatedInfo: ConnectionInfo = {
        ...this.connectionInfo,
        isConnected: !!this.room,
        peerConnected: peerIds.length > 0
      };

      console.log('连接状态更新:', {
        isConnected: updatedInfo.isConnected,
        peerConnected: updatedInfo.peerConnected,
        peerCount: peerIds.length
      });

      // 更新内部状态
      this.connectionInfo = updatedInfo;

      // 通知回调
      this.onConnectionChangeCallback?.(updatedInfo);
    }
  }

  // 断开连接
  disconnect() {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.connectionInfo = null;
    this.opponentPlayerId = null;
  }

  // 设置回调函数
  onDiceRoll(callback: (roll: DiceRoll) => void) {
    this.onDiceRollCallback = callback;
  }

  onScoreUpdate(callback: (update: ScoreUpdate) => void) {
    this.onScoreUpdateCallback = callback;
  }

  onGameState(callback: (state: GameState) => void) {
    this.onGameStateCallback = callback;
  }

  onConnectionChange(callback: (info: ConnectionInfo) => void) {
    this.onConnectionChangeCallback = callback;
  }

  onPlayerReady(callback: (readyState: PlayerReadyState) => void) {
    this.onPlayerReadyCallback = callback;
  }

  onDiceSelection(callback: (selection: DiceSelectionUpdate) => void) {
    this.onDiceSelectionCallback = callback;
  }

  onDiceRollStart(callback: (rollStart: DiceRollStart) => void) {
    this.onDiceRollStartCallback = callback;
  }

  onPlayerAction(callback: (action: PlayerAction) => void) {
    this.onPlayerActionCallback = callback;
  }

  onDurationUpdate(callback: (duration: DurationUpdate) => void) {
    this.onDurationUpdateCallback = callback;
  }

  onScoreOptions(callback: (options: ScoreOptionsUpdate) => void) {
    this.onScoreOptionsCallback = callback;
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallback = callback;
  }

  // 获取连接信息
  getConnectionInfo(): ConnectionInfo | null {
    return this.connectionInfo;
  }

  // 获取自己的ID
  getSelfId(): string {
    return this.selfId;
  }
}
