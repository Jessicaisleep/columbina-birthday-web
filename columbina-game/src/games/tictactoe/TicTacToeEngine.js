import { AI, GAME_STATUS, HUMAN, createMove, otherPlayer } from '../shared.js'

export const TICTACTOE_SIZE = 3
export const MAX_ACTIVE_PIECES = 5
const LINES = [
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
  return Array.from({ length: TICTACTOE_SIZE }, () => Array(TICTACTOE_SIZE).fill(null))
}

export function getActiveMoves(moves) {
  return moves.slice(Math.max(0, moves.length - MAX_ACTIVE_PIECES))
}

export function boardFromMoves(moves) {
  const board = emptyBoard()
  getActiveMoves(moves).forEach((move) => {
    board[move.row][move.col] = move.player
  })
  return board
}

export function findTicTacToeWin(board) {
  for (const line of LINES) {
    const player = board[line[0][0]][line[0][1]]
    if (player && line.every(([row, col]) => board[row][col] === player)) {
      return { winner: player, winningLine: line.map(([row, col]) => ({ row, col })) }
    }
  }
  return { winner: null, winningLine: [] }
}

function stateFromMoves(moves, firstPlayer = HUMAN, forcedStatus = null) {
  const board = boardFromMoves(moves)
  const { winner, winningLine } = findTicTacToeWin(board)
  let status = forcedStatus || GAME_STATUS.PLAYING
  if (winner) status = winner === HUMAN ? GAME_STATUS.WON : GAME_STATUS.LOST
  return {
    board,
    moves: moves.map((move) => ({ ...move })),
    activeMoves: getActiveMoves(moves).map((move) => ({ ...move })),
    currentPlayer: moves.length % 2 === 0 ? firstPlayer : otherPlayer(firstPlayer),
    firstPlayer,
    moveCount: moves.length,
    status,
    winner: winner || undefined,
    winningLine,
    drawAvailable: moves.length >= 25 && !winner && status === GAME_STATUS.PLAYING,
  }
}

export const TicTacToeEngine = {
  createInitialState(firstPlayer = HUMAN) {
    return stateFromMoves([], firstPlayer)
  },

  getLegalMoves(state) {
    if (state.status !== GAME_STATUS.PLAYING) return []
    const moves = []
    for (let row = 0; row < TICTACTOE_SIZE; row += 1) {
      for (let col = 0; col < TICTACTOE_SIZE; col += 1) {
        if (!state.board[row][col]) moves.push({ row, col })
      }
    }
    return moves
  },

  makeMove(state, position) {
    if (state.status !== GAME_STATUS.PLAYING) return state
    const legal = this.getLegalMoves(state).some(({ row, col }) => row === position.row && col === position.col)
    if (!legal) return state
    const move = createMove(
      position.player || state.currentPlayer,
      position.row,
      position.col,
      state.moveCount + 1,
      position.timestamp,
    )
    return stateFromMoves([...state.moves, move], state.firstPlayer)
  },

  restore(moves, firstPlayer = HUMAN) {
    return stateFromMoves(moves, firstPlayer)
  },

  checkWinner(state) {
    return findTicTacToeWin(state.board).winner
  },

  isDraw(state) {
    return state.status === GAME_STATUS.DRAW
  },

  claimDraw(state) {
    if (!state.drawAvailable || state.winner) return state
    return { ...state, status: GAME_STATUS.DRAW, drawAvailable: false }
  },
}
