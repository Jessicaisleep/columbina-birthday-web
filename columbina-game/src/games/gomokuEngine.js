import { AI, GAME_STATUS, HUMAN, createMove, otherPlayer } from './shared.js'

export const GOMOKU_SIZE = 15
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]]

function emptyBoard() {
  return Array.from({ length: GOMOKU_SIZE }, () => Array(GOMOKU_SIZE).fill(null))
}

export function createGomokuState(firstPlayer = HUMAN) {
  return {
    board: emptyBoard(), moves: [], currentPlayer: firstPlayer, moveCount: 0,
    status: GAME_STATUS.PLAYING, winner: null, winningLine: [],
  }
}

export function findGomokuWin(board, lastMove = null) {
  const origins = lastMove ? [lastMove] : board.flatMap((row, r) => row.map((_, c) => ({ row: r, col: c })))
  for (const origin of origins) {
    const player = board[origin.row]?.[origin.col]
    if (!player) continue
    for (const [dr, dc] of DIRECTIONS) {
      const line = [{ row: origin.row, col: origin.col }]
      for (const sign of [-1, 1]) {
        let row = origin.row + dr * sign
        let col = origin.col + dc * sign
        const branch = []
        while (board[row]?.[col] === player) {
          branch.push({ row, col }); row += dr * sign; col += dc * sign
        }
        if (sign < 0) line.unshift(...branch.reverse())
        else line.push(...branch)
      }
      if (line.length >= 5) return { winner: player, line }
    }
  }
  return null
}

export function getGomokuLegalMoves(state) {
  if (state.status !== GAME_STATUS.PLAYING) return []
  const result = []
  for (let row = 0; row < GOMOKU_SIZE; row += 1) {
    for (let col = 0; col < GOMOKU_SIZE; col += 1) if (!state.board[row][col]) result.push({ row, col })
  }
  return result
}

export function makeGomokuMove(state, move) {
  if (state.status !== GAME_STATUS.PLAYING) return state
  const { row, col } = move
  if (row < 0 || col < 0 || row >= GOMOKU_SIZE || col >= GOMOKU_SIZE || state.board[row][col]) return state
  const board = state.board.map((line) => [...line])
  board[row][col] = state.currentPlayer
  const entry = createMove(state.currentPlayer, row, col, state.moveCount + 1, move.timestamp)
  const moves = [...state.moves, entry]
  const win = findGomokuWin(board, entry)
  const winner = win?.winner || null
  const draw = !winner && moves.length === GOMOKU_SIZE * GOMOKU_SIZE
  return {
    ...state, board, moves, moveCount: moves.length, winner,
    winningLine: win?.line || [],
    currentPlayer: winner || draw ? state.currentPlayer : otherPlayer(state.currentPlayer),
    status: winner ? (winner === HUMAN ? GAME_STATUS.WON : GAME_STATUS.LOST) : draw ? GAME_STATUS.DRAW : GAME_STATUS.PLAYING,
  }
}

export function rebuildGomokuState(moves, firstPlayer = HUMAN) {
  return moves.reduce(
    (state, move) => makeGomokuMove(state, { row: move.row, col: move.col, timestamp: move.timestamp }),
    createGomokuState(firstPlayer),
  )
}

export const GomokuEngine = {
  createInitialState: createGomokuState,
  getLegalMoves: getGomokuLegalMoves,
  makeMove: makeGomokuMove,
  checkWinner: (state) => findGomokuWin(state.board, state.moves.at(-1))?.winner || null,
  isDraw: (state) => state.status === GAME_STATUS.DRAW,
}

export { HUMAN, AI }
