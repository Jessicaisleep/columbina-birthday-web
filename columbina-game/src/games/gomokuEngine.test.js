import { describe, expect, it } from 'vitest'
import { AI, HUMAN } from './shared.js'
import { createGomokuState, findGomokuWin, makeGomokuMove } from './gomokuEngine.js'
import { chooseGomokuMove, evaluateGomokuBoard, wouldWin } from './gomokuAI.js'

function boardWith(points, player = HUMAN) {
  const board = Array.from({ length: 15 }, () => Array(15).fill(null))
  points.forEach(([row, col]) => { board[row][col] = player })
  return board
}

describe('五子棋规则', () => {
  it('识别四个方向、边缘与角落五连', () => {
    const cases = [
      [[7,2],[7,3],[7,4],[7,5],[7,6]],
      [[2,7],[3,7],[4,7],[5,7],[6,7]],
      [[2,2],[3,3],[4,4],[5,5],[6,6]],
      [[2,12],[3,11],[4,10],[5,9],[6,8]],
      [[0,0],[0,1],[0,2],[0,3],[0,4]],
      [[14,10],[14,11],[14,12],[14,13],[14,14]],
    ]
    cases.forEach((points) => expect(findGomokuWin(boardWith(points)).winner).toBe(HUMAN))
  })

  it('六连同样判胜，四连不判胜', () => {
    expect(findGomokuWin(boardWith([[3,1],[3,2],[3,3],[3,4],[3,5],[3,6]])).winner).toBe(HUMAN)
    expect(findGomokuWin(boardWith([[3,1],[3,2],[3,3],[3,4]]))).toBeNull()
  })

  it('落子保持状态不可变', () => {
    const state = createGomokuState()
    const next = makeGomokuMove(state, { row: 7, col: 7 })
    expect(state.board[7][7]).toBeNull()
    expect(next.board[7][7]).toBe(HUMAN)
  })
})

describe('五子棋 AI', () => {
  it('自己存在必胜点时优先获胜', () => {
    const board = boardWith([[7,3],[7,4],[7,5],[7,6]], AI)
    const move = chooseGomokuMove({ board }, 'hard')
    expect(wouldWin(board, move, AI)).toBe(true)
  })

  it('玩家存在必胜点时优先防守', () => {
    const board = boardWith([[6,4],[6,5],[6,6],[6,7]], HUMAN)
    const move = chooseGomokuMove({ board }, 'hard')
    expect(wouldWin(board, move, HUMAN)).toBe(true)
  })

  it('能识别活三和冲四的局面价值', () => {
    const openThree = boardWith([[7,6],[7,7],[7,8]], AI)
    const two = boardWith([[7,7],[7,8]], AI)
    const four = boardWith([[7,6],[7,7],[7,8],[7,9]], AI)
    expect(evaluateGomokuBoard(openThree, AI)).toBeGreaterThan(evaluateGomokuBoard(two, AI))
    expect(evaluateGomokuBoard(four, AI)).toBeGreaterThan(evaluateGomokuBoard(openThree, AI))
  })
})
