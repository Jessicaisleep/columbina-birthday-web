import { describe, expect, it } from 'vitest'
import { AI, GAME_STATUS, HUMAN } from './shared.js'
import {
  activeMoves, boardFromMoves, claimTicTacToeDraw, createTicTacToeState,
  findTicTacToeWin, getTicTacToeLegalMoves, makeTicTacToeMove,
} from './ticTacToeEngine.js'
import { getTicTacToeBestMove } from './ticTacToeAI.js'

function play(sequence) {
  return sequence.reduce((state, [row, col]) => makeTicTacToeMove(state, { row, col }), createTicTacToeState())
}

function longGame(count) {
  let state = createTicTacToeState()
  while (state.moveCount < count) {
    const next = getTicTacToeLegalMoves(state)
      .map((move) => makeTicTacToeMove(state, move))
      .find((candidate) => !candidate.winner)
    if (!next) throw new Error(`无法生成第 ${state.moveCount + 1} 手测试局面`)
    state = next
  }
  return state
}

describe('流转井字规则', () => {
  it.each([
    [[[0,0],[1,0],[0,1],[1,1],[0,2]], HUMAN],
    [[[0,0],[0,1],[1,0],[1,1],[2,2],[2,1]], AI],
    [[[0,0],[0,1],[1,1],[1,0],[2,2]], HUMAN],
    [[[0,2],[0,0],[1,1],[1,0],[2,0]], HUMAN],
  ])('正确识别横、纵和两条对角线胜利', (moves, winner) => {
    expect(play(moves).winner).toBe(winner)
  })

  it('第 1～5 手不删除棋子', () => {
    const state = play([[0,0],[1,1],[0,1],[2,2],[1,0]])
    expect(state.activeMoves).toHaveLength(5)
    expect(state.board[0][0]).toBe(HUMAN)
  })

  it('第6手落子后第1枚棋子消失', () => {
    const state = play([[0,0],[1,1],[0,1],[2,2],[1,0],[2,0]])
    expect(state.board[0][0]).toBeNull()
    expect(state.moves).toHaveLength(6)
  })

  it('第7手落子后第2枚棋子消失', () => {
    const state = play([[0,0],[1,1],[0,1],[2,2],[1,0],[2,0],[0,2]])
    expect(state.board[1][1]).toBeNull()
    expect(state.moves).toHaveLength(7)
  })

  it('第8手落子后第3枚棋子消失', () => {
    const state = play([[0,0],[1,1],[0,1],[2,2],[1,0],[2,0],[0,2],[1,1]])
    expect(state.board[0][1]).toBeNull()
    expect(state.moves).toHaveLength(8)
  })

  it('历史记录不会因为棋子消失而删除', () => {
    const moves = Array.from({ length: 40 }, (_, i) => ({ player: i % 2 ? AI : HUMAN, row: i % 3, col: (i * 2) % 3, moveNumber: i + 1 }))
    expect(activeMoves(moves)).toHaveLength(5)
    expect(moves).toHaveLength(40)
    expect(activeMoves(moves)[0].moveNumber).toBe(36)
  })

  it('棋子消失后只根据当前有效棋子判断胜负', () => {
    const history = [
      { player:HUMAN,row:0,col:0 }, { player:HUMAN,row:0,col:1 }, { player:HUMAN,row:0,col:2 },
      { player:AI,row:1,col:0 }, { player:AI,row:1,col:1 }, { player:HUMAN,row:2,col:2 },
    ]
    expect(findTicTacToeWin(boardFromMoves(history))).toBeNull()
  })

  it('25手后出现平局选项并且仍可继续', () => {
    const state = longGame(25)
    expect(state.drawAvailable).toBe(true)
    expect(state.status).toBe(GAME_STATUS.PLAYING)
    const continued = getTicTacToeLegalMoves(state).map((m) => makeTicTacToeMove(state, m)).find((s) => !s.winner)
    expect(continued.moveCount).toBe(26)
  })

  it('点击判定平局后游戏结束', () => {
    expect(claimTicTacToeDraw(longGame(25)).status).toBe(GAME_STATUS.DRAW)
  })

  it('第40手后仍正确维护最近5枚棋子与平局选项', () => {
    const state = longGame(40)
    expect(state.moves).toHaveLength(40)
    expect(state.activeMoves.map((move) => move.moveNumber)).toEqual([36, 37, 38, 39, 40])
    expect(state.drawAvailable).toBe(true)
  })

  it('困难 AI 在相同局面选择稳定', async () => {
    const state = play([[1, 1]])
    expect(await getTicTacToeBestMove(state, 'hard')).toEqual(await getTicTacToeBestMove(state, 'hard'))
  })
})
