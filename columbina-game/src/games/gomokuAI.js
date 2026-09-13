import { AI, HUMAN } from './shared.js'

/**
 * The evaluator is deliberately kept in this module instead of a Vue
 * component.  It is also imported by gomoku.worker.js, so the same rules are
 * used whether the search runs on the main thread or in a Worker.
 */
export const GOMOKU_SCORE = Object.freeze({
  FIVE: 1_000_000,
  OPEN_FOUR: 100_000,
  FOUR: 10_000,
  OPEN_THREE: 5_000,
  THREE: 500,
  OPEN_TWO: 200,
  TWO: 20,
})

export const GOMOKU_DIRECTIONS = Object.freeze([
  [0, 1], [1, 0], [1, 1], [1, -1],
])

const SIZE = 15
const EMPTY = null
const WIN_SCORE = GOMOKU_SCORE.FIVE * 10

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE
}

function cloneBoard(board) {
  return board.map((row) => [...row])
}

function getBoard(stateOrBoard) {
  return Array.isArray(stateOrBoard?.board) ? stateOrBoard.board : stateOrBoard
}

function countDirection(board, row, col, player, dr, dc) {
  let count = 0
  let nextRow = row + dr
  let nextCol = col + dc
  while (inBounds(nextRow, nextCol) && board[nextRow]?.[nextCol] === player) {
    count += 1
    nextRow += dr
    nextCol += dc
  }
  return count
}

function hasFiveAt(board, row, col, player) {
  for (const [dr, dc] of GOMOKU_DIRECTIONS) {
    const line = 1 + countDirection(board, row, col, player, dr, dc)
      + countDirection(board, row, col, player, -dr, -dc)
    if (line >= 5) return true
  }
  return false
}

/** Check a possible move without mutating the caller's state. */
export function wouldWin(board, move, player) {
  const { row, col } = move
  if (!inBounds(row, col) || board[row]?.[col] !== EMPTY) return false
  for (const [dr, dc] of GOMOKU_DIRECTIONS) {
    const line = 1 + countDirection(board, row, col, player, dr, dc)
      + countDirection(board, row, col, player, -dr, -dc)
    if (line >= 5) return true
  }
  return false
}

function scoreRun(length, open) {
  if (length >= 5) return GOMOKU_SCORE.FIVE + (length - 5) * 1_000
  if (length === 4) return open === 2 ? GOMOKU_SCORE.OPEN_FOUR : open === 1 ? GOMOKU_SCORE.FOUR : 0
  if (length === 3) return open === 2 ? GOMOKU_SCORE.OPEN_THREE : open === 1 ? GOMOKU_SCORE.THREE : 0
  if (length === 2) return open === 2 ? GOMOKU_SCORE.OPEN_TWO : open === 1 ? GOMOKU_SCORE.TWO : 0
  return 0
}

function lineFromStart(board, row, col, dr, dc) {
  const values = []
  let r = row
  let c = col
  while (inBounds(r, c)) {
    values.push(board[r][c])
    r += dr
    c += dc
  }
  return values
}

/**
 * Scores both contiguous and common broken threats (for example XX.XX).
 * A broken threat is intentionally worth less than a contiguous one, while
 * still making the AI recognise it as a useful forcing move.
 */
function scorePlayer(board, player) {
  let total = 0
  for (const [dr, dc] of GOMOKU_DIRECTIONS) {
    const starts = []
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const previousRow = row - dr
        const previousCol = col - dc
        if (!inBounds(previousRow, previousCol)) starts.push([row, col])
      }
    }
    for (const [startRow, startCol] of starts) {
      const line = lineFromStart(board, startRow, startCol, dr, dc)
      let index = 0
      while (index < line.length) {
        if (line[index] !== player) {
          index += 1
          continue
        }
        const begin = index
        while (index < line.length && line[index] === player) index += 1
        total += scoreRun(index - begin, (begin > 0 && line[begin - 1] === EMPTY ? 1 : 0)
          + (index < line.length && line[index] === EMPTY ? 1 : 0))
      }

      // Evaluate small windows for jump/broken patterns. Opponent and board
      // edges act as blockers, so a pattern cannot be scored through them.
      const symbols = line.map((cell) => cell === player ? '1' : cell === EMPTY ? '0' : '2').join('')
      const patterns = [
        ['011110', GOMOKU_SCORE.OPEN_FOUR],
        ['01110', GOMOKU_SCORE.OPEN_THREE],
        ['01101', GOMOKU_SCORE.THREE], ['01011', GOMOKU_SCORE.THREE],
        ['10110', GOMOKU_SCORE.THREE], ['11010', GOMOKU_SCORE.THREE],
        ['01100', GOMOKU_SCORE.OPEN_TWO], ['00110', GOMOKU_SCORE.OPEN_TWO],
        ['01010', GOMOKU_SCORE.OPEN_TWO],
      ]
      for (const [pattern, value] of patterns) {
        let from = 0
        while ((from = symbols.indexOf(pattern, from)) >= 0) {
          total += value
          from += 1
        }
      }
    }
  }
  // Slight preference for the centre keeps the opening natural and helps
  // break otherwise identical ties deterministically.
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === player) {
        total += Math.max(0, 8 - Math.abs(7 - row)) + Math.max(0, 8 - Math.abs(7 - col))
      }
    }
  }
  return total
}

export function evaluateGomokuBoard(board, perspective = AI) {
  const opponent = perspective === AI ? HUMAN : AI
  return scorePlayer(board, perspective) - scorePlayer(board, opponent)
}

function candidateSet(board, radius = 2) {
  const result = new Set()
  let occupied = 0
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === EMPTY) continue
      occupied += 1
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          const nextRow = row + dr
          const nextCol = col + dc
          if (inBounds(nextRow, nextCol) && board[nextRow][nextCol] === EMPTY) {
            result.add(`${nextRow},${nextCol}`)
          }
        }
      }
    }
  }
  if (!occupied) return [{ row: 7, col: 7 }]
  return [...result].map((key) => {
    const [row, col] = key.split(',').map(Number)
    return { row, col }
  })
}

function moveHeuristic(board, move, player = AI) {
  const next = cloneBoard(board)
  next[move.row][move.col] = player
  if (wouldWin(board, move, player)) return WIN_SCORE
  const own = evaluateGomokuBoard(next, player)
  const opponent = player === AI ? HUMAN : AI
  // A move that blocks a direct win is almost as important as creating one.
  const defense = wouldWin(board, move, opponent) ? GOMOKU_SCORE.FIVE * 0.8 : 0
  const center = 12 - Math.abs(7 - move.row) - Math.abs(7 - move.col)
  return own + defense + center
}

// Candidate ordering must remain cheap: the search calls this function at
// every node. Full pattern evaluation is reserved for the selected moves.
function movePriority(board, move, player = AI) {
  if (wouldWin(board, move, player)) return WIN_SCORE
  const opponent = player === AI ? HUMAN : AI
  let value = 12 - Math.abs(7 - move.row) - Math.abs(7 - move.col)
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (!dr && !dc) continue
      const cell = board[move.row + dr]?.[move.col + dc]
      const distance = Math.abs(dr) + Math.abs(dc)
      if (cell === player) value += distance <= 1 ? 9 : 3
      else if (cell === opponent) value += distance <= 1 ? 8 : 2
    }
  }
  if (wouldWin(board, move, opponent)) value += GOMOKU_SCORE.FOUR
  return value
}

/** Return nearby empty cells, ordered by tactical value. */
export function getGomokuCandidates(stateOrBoard, radius = 2, limit = 64) {
  const board = getBoard(stateOrBoard)
  const candidates = candidateSet(board, radius)
  candidates.sort((a, b) => movePriority(board, b) - movePriority(board, a))
  return candidates.slice(0, Math.max(1, limit))
}

function winningCandidate(board, candidates, player) {
  return candidates.find((move) => wouldWin(board, move, player)) || null
}

function hasAnyFive(board, player) {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === player) {
        for (const [dr, dc] of GOMOKU_DIRECTIONS) {
          const previous = board[row - dr]?.[col - dc]
          if (previous === player) continue
          let count = 0
          while (board[row + dr * count]?.[col + dc * count] === player) count += 1
          if (count >= 5) return true
        }
      }
    }
  }
  return false
}

function search(board, player, depth, alpha, beta, rootPlayer, lastMove, lastPlayer) {
  const opponent = player === AI ? HUMAN : AI
  if (lastMove && hasFiveAt(board, lastMove.row, lastMove.col, lastPlayer)) {
    return lastPlayer === rootPlayer ? WIN_SCORE + depth : -WIN_SCORE - depth
  }
  if (depth <= 0) return evaluateGomokuBoard(board, rootPlayer)

  const maximizing = player === rootPlayer
  const candidates = getGomokuCandidates(board, 2, depth > 1 ? 8 : 12)
  if (!candidates.length) return evaluateGomokuBoard(board, rootPlayer)
  let best = maximizing ? -Infinity : Infinity
  for (const move of candidates) {
    const next = cloneBoard(board)
    next[move.row][move.col] = player
    const value = search(next, opponent, depth - 1, alpha, beta, rootPlayer, move, player)
    if (maximizing) {
      best = Math.max(best, value)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, value)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return best
}

/** Synchronous core used by both the async API and the Web Worker. */
export function chooseGomokuMove(state, difficulty = 'medium') {
  const board = getBoard(state)
  if (!Array.isArray(board) || board.length !== SIZE) return null
  const candidates = getGomokuCandidates(board, 2, difficulty === 'hard' ? 36 : 48)
  if (!candidates.length) return null

  const win = winningCandidate(board, candidates, AI)
  if (win) return win
  const block = winningCandidate(board, candidates, HUMAN)
  if (block) return block
  if (difficulty === 'easy') {
    // Use a small, noisy shortlist. Easy still understands immediate threats
    // (handled above), but does not play a perfect positional game.
    const shortlist = candidates.slice(0, Math.min(7, candidates.length))
    return shortlist[Math.floor(Math.random() * shortlist.length)]
  }

  const depth = difficulty === 'hard' ? 2 : 1
  const rootCandidates = candidates.slice(0, difficulty === 'hard' ? 12 : 16)
  let bestMove = rootCandidates[0]
  let bestScore = -Infinity
  for (const move of rootCandidates) {
    const next = cloneBoard(board)
    next[move.row][move.col] = AI
    const score = search(next, HUMAN, depth, -Infinity, Infinity, AI, move, AI)
    if (score > bestScore || (score === bestScore && move.row * SIZE + move.col < bestMove.row * SIZE + bestMove.col)) {
      bestMove = move
      bestScore = score
    }
  }
  return bestMove
}

/**
 * Async AIEngine interface. In a browser this delegates the search to a
 * short-lived module Worker; the fallback keeps tests and non-browser use
 * asynchronous without requiring a Worker implementation.
 */
export function getGomokuBestMove(state, difficulty = 'medium', options = {}) {
  const signal = options?.signal
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return new Promise((resolve) => {
      let worker
      let settled = false
      const finish = (move) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', abort)
        worker?.terminate()
        resolve(move)
      }
      const abort = () => finish(null)
      if (signal?.aborted) return finish(null)
      signal?.addEventListener('abort', abort, { once: true })
      try {
        worker = new Worker(new URL('./gomoku.worker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (event) => {
          if (event.data?.type === 'RESULT') {
            finish(event.data.move || null)
          } else if (event.data?.type === 'ERROR') {
            console.error('[GomokuAI]', event.data.error)
            finish(null)
          }
        }
        worker.onerror = (error) => {
          console.error('[GomokuAI Worker]', error)
          finish(signal?.aborted ? null : chooseGomokuMove(state, difficulty))
        }
        worker.postMessage({ type: 'SEARCH', state, difficulty })
      } catch (error) {
        console.error('[GomokuAI] Worker unavailable, using fallback', error)
        worker?.terminate()
        setTimeout(() => finish(signal?.aborted ? null : chooseGomokuMove(state, difficulty)), 0)
      }
    })
  }
  return new Promise((resolve) => setTimeout(() => resolve(signal?.aborted ? null : chooseGomokuMove(state, difficulty)), 0))
}

export const GomokuAI = Object.freeze({ getBestMove: getGomokuBestMove })
