export const HUMAN = 'human'
export const AI = 'ai'

export const GAME_STATUS = Object.freeze({
   IDLE: 'idle',
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
  DRAW: 'draw',
})

export function createMove(player, row, col, moveNumber, timestamp = Date.now()) {
  return { player, row, col, moveNumber, timestamp }
}

export function otherPlayer(player) {
  return player === HUMAN ? AI : HUMAN
}
