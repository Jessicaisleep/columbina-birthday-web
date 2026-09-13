import { AI, HUMAN } from './shared.js'
import { getTicTacToeLegalMoves, makeTicTacToeMove } from './ticTacToeEngine.js'

const LINES = [
  [[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]], [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]],
]

function evaluate(state) {
  if (state.winner === AI) return 10000
  if (state.winner === HUMAN) return -10000
  let score = 0
  for (const line of LINES) {
    const cells = line.map(([row, col]) => state.board[row][col])
    const ai = cells.filter((cell) => cell === AI).length
    const human = cells.filter((cell) => cell === HUMAN).length
    if (!human) score += ai === 2 ? 20 : ai === 1 ? 3 : 0
    if (!ai) score -= human === 2 ? 24 : human === 1 ? 3 : 0
  }
  const oldest = state.activeMoves[0]
  if (oldest) score += oldest.player === AI ? -2 : 2
  return score
}

function immediateMove(state, player) {
  for (const move of getTicTacToeLegalMoves(state)) {
    const simulated = makeTicTacToeMove({ ...state, currentPlayer: player }, move)
    if (simulated.winner === player) return move
  }
  return null
}

function search(state, depth, alpha, beta, cache) {
  if (state.winner || depth === 0) return evaluate(state)
  const legal = getTicTacToeLegalMoves(state)
  if (!legal.length) return evaluate(state)
  const key = `${state.currentPlayer}|${depth}|${state.activeMoves.map((m) => `${m.player[0]}${m.row}${m.col}`).join('')}`
  if (cache.has(key)) return cache.get(key)

  const maximizing = state.currentPlayer === AI
  let best = maximizing ? -Infinity : Infinity
  for (const move of legal) {
    const value = search(makeTicTacToeMove(state, move), depth - 1, alpha, beta, cache)
    if (maximizing) {
      best = Math.max(best, value)
      alpha = Math.max(alpha, value)
    } else {
      best = Math.min(best, value)
      beta = Math.min(beta, value)
    }
    if (beta <= alpha) break
  }
  cache.set(key, best)
  return best
}

export async function getTicTacToeBestMove(state, difficulty = 'medium') {
  const legal = getTicTacToeLegalMoves(state)
  if (!legal.length) return null
  if (difficulty === 'easy') {
    const win = immediateMove(state, AI)
    if (win && Math.random() > 0.28) return win
    return legal[Math.floor(Math.random() * legal.length)]
  }

  const win = immediateMove(state, AI)
  if (win) return win
  const block = immediateMove(state, HUMAN)
  if (block) return block

  const depth = difficulty === 'hard' ? 12 : 5
  const cache = new Map()
  let bestMove = legal[0]
  let bestScore = -Infinity
  for (const move of legal) {
    const next = makeTicTacToeMove(state, move)
    const score = search(next, depth - 1, -Infinity, Infinity, cache)
    const positionBonus = move.row === 1 && move.col === 1 ? 0.2 : 0
    if (score + positionBonus > bestScore) {
      bestScore = score + positionBonus
      bestMove = move
    }
  }
  return bestMove
}

export const TicTacToeAI = { getBestMove: getTicTacToeBestMove }
