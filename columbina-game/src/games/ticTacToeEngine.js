import { AI, GAME_STATUS, HUMAN, createMove, otherPlayer } from './shared.js'

export const TTT_SIZE = 3
export const MAX_ACTIVE_PIECES = 5
export const DRAW_OPTION_AT = 25

const WIN_LINES = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
]

function emptyBoard() {
  return Array.from({ length: TTT_SIZE }, () => Array(TTT_SIZE).fill(null))
}

export function activeMoves(moves) {
  return moves.slice(Math.max(0, moves.length - MAX_ACTIVE_PIECES))
}

export function boardFromMoves(moves) {
  const board = emptyBoard()
  activeMoves(moves).forEach((move) => { board[move.row][move.col] = move.player })
  return board
}

export function findTicTacToeWin(board) {
  for (const line of WIN_LINES) {
    const player = board[line[0][0]][line[0][1]]
    if (player && line.every(([row, col]) => board[row][col] === player)) {
      return { winner: player, line: line.map(([row, col]) => ({ row, col })) }
    }
  }
  return null
}

export function createTicTacToeState(firstPlayer = HUMAN) {
  return {
    board: emptyBoard(),
    moves: [],
    activeMoves: [],
    currentPlayer: firstPlayer,
    moveCount: 0,
    status: GAME_STATUS.PLAYING,
    winner: null,
    winningLine: [],
    drawAvailable: false,
  }
}

export function getTicTacToeLegalMoves(state) {
  if (state.status !== GAME_STATUS.PLAYING) return []
  const result = []
  for (let row = 0; row < TTT_SIZE; row += 1) {
    for (let col = 0; col < TTT_SIZE; col += 1) {
      if (!state.board[row][col]) result.push({ row, col })
    }
  }
  return result
}

export function makeTicTacToeMove(state, move) {
  if (state.status !== GAME_STATUS.PLAYING) return state
  const { row, col } = move
  if (row < 0 || col < 0 || row >= TTT_SIZE || col >= TTT_SIZE || state.board[row][col]) return state

  const entry = createMove(state.currentPlayer, row, col, state.moveCount + 1, move.timestamp)
  const moves = [...state.moves, entry]
  const currentActiveMoves = activeMoves(moves)
  const board = boardFromMoves(moves)
  const win = findTicTacToeWin(board)
  const winner = win?.winner || null

  return {
    ...state,
    board,
    moves,
    activeMoves: currentActiveMoves,
    currentPlayer: winner ? state.currentPlayer : otherPlayer(state.currentPlayer),
    moveCount: moves.length,
    status: winner ? (winner === HUMAN ? GAME_STATUS.WON : GAME_STATUS.LOST) : GAME_STATUS.PLAYING,
    winner,
    winningLine: win?.line || [],
    drawAvailable: !winner && moves.length >= DRAW_OPTION_AT,
  }
}

export function rebuildTicTacToeState(moves, firstPlayer = HUMAN) {
  return moves.reduce(
    (state, move) => makeTicTacToeMove(state, { row: move.row, col: move.col, timestamp: move.timestamp }),
    createTicTacToeState(firstPlayer),
  )
}

export function claimTicTacToeDraw(state) {
  if (!state.drawAvailable || state.status !== GAME_STATUS.PLAYING) return state
  return { ...state, status: GAME_STATUS.DRAW, drawAvailable: false }
}

export const TicTacToeEngine = {
  createInitialState: createTicTacToeState,
  getLegalMoves: getTicTacToeLegalMoves,
  makeMove: makeTicTacToeMove,
  checkWinner: (state) => findTicTacToeWin(state.board)?.winner || null,
  isDraw: (state) => state.status === GAME_STATUS.DRAW,
}

export { HUMAN, AI }
