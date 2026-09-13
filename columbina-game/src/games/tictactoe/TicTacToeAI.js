import { AI, HUMAN } from '../shared.js'
import { MAX_ACTIVE_PIECES, TicTacToeEngine } from './TicTacToeEngine.js'

function linePotential(board, player) {
  const lines = [
    [[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]], [[2, 0], [2, 1], [2, 2]],
    [[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]],
    [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]],
  ]
  return lines.reduce((score, line) => {
    const cells = line.map(([r, c]) => board[r][c])
    if (cells.includes(player === AI ? HUMAN : AI)) return score
    const count = cells.filter((cell) => cell === player).length
    return score + (count === 2 ? 18 : count === 1 ? 3 : 1)
  }, 0)
}

function evaluate(state) {
  if (state.winner === AI) return 10_000 - state.moveCount
  if (state.winner === HUMAN) return -10_000 + state.moveCount
  let value = linePotential(state.board, AI) - linePotential(state.board, HUMAN)
  if (state.board[1][1] === AI) value += 3
  if (state.board[1][1] === HUMAN) value -= 3
  const expiring = state.activeMoves[0]
  if (state.activeMoves.length === MAX_ACTIVE_PIECES && expiring) {
    value += expiring.player === HUMAN ? 4 : -4
  }
  return value
}

function minimax(state, depth, alpha, beta) {
  if (state.winner || depth === 0) return evaluate(state)
  const legal = TicTacToeEngine.getLegalMoves(state)
  if (!legal.length) return evaluate(state)
  const maximizing = state.currentPlayer === AI
  let best = maximizing ? -Infinity : Infinity
  for (const move of legal) {
    const child = TicTacToeEngine.makeMove(state, move)
    const score = minimax(child, depth - 1, alpha, beta)
    if (maximizing) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return best
}

function immediateMove(state, player) {
  for (const move of TicTacToeEngine.getLegalMoves(state)) {
    const probe = TicTacToeEngine.makeMove({ ...state, currentPlayer: player }, { ...move, player })
    if (probe.winner === player) return move
  }
  return null
}

export const TicTacToeAI = {
  async getBestMove(state, difficulty = 'medium') {
    await Promise.resolve()
    const legal = TicTacToeEngine.getLegalMoves(state)
    if (!legal.length) return null
    const win = immediateMove(state, AI)
    if (win) return win
    const block = immediateMove(state, HUMAN)
    if (block) return block
    if (difficulty === 'easy') return legal[Math.floor(Math.random() * legal.length)]

    const depth = difficulty === 'hard' ? 10 : 5
    let bestMove = legal[0]
    let bestScore = -Infinity
    for (const move of legal) {
      const child = TicTacToeEngine.makeMove(state, move)
      const score = minimax(child, depth - 1, -Infinity, Infinity)
      if (score > bestScore) {
        bestScore = score
        bestMove = move
      }
    }
    return bestMove
  },
}
