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

  it.each(['easy', 'medium', 'hard'])('%s 难度重开后仍堵截玩家活三，而非转去发展远处棋群', (difficulty) => {
    const board = boardWith([[7,6],[7,7],[7,8]], HUMAN)
    ;[[3,3],[3,4],[4,3],[10,10],[10,11],[11,10]].forEach(([row, col]) => { board[row][col] = AI })
    const move = chooseGomokuMove({ board }, difficulty)
    expect([{ row: 7, col: 5 }, { row: 7, col: 9 }]).toContainEqual(move)
  })

  it.each([
    ['纵向', [[6,7],[7,7],[8,7]], [{ row: 5, col: 7 }, { row: 9, col: 7 }]],
    ['主对角线', [[6,6],[7,7],[8,8]], [{ row: 5, col: 5 }, { row: 9, col: 9 }]],
    ['副对角线', [[6,8],[7,7],[8,6]], [{ row: 5, col: 9 }, { row: 9, col: 5 }]],
  ])('困难难度能堵截%s活三', (_, points, defenses) => {
    const board = boardWith(points, HUMAN)
    ;[[3,3],[3,4],[4,3],[10,10],[10,11],[11,10]].forEach(([row, col]) => { board[row][col] = AI })
    expect(defenses).toContainEqual(chooseGomokuMove({ board }, 'hard'))
  })

  it('能识别活三和冲四的局面价值', () => {
    const openThree = boardWith([[7,6],[7,7],[7,8]], AI)
    const two = boardWith([[7,7],[7,8]], AI)
    const four = boardWith([[7,6],[7,7],[7,8],[7,9]], AI)
    expect(evaluateGomokuBoard(openThree, AI)).toBeGreaterThan(evaluateGomokuBoard(two, AI))
    expect(evaluateGomokuBoard(four, AI)).toBeGreaterThan(evaluateGomokuBoard(openThree, AI))
  })
})
