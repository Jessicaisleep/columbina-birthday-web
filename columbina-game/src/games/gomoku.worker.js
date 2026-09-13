import { chooseGomokuMove } from './gomokuAI.js'

/*
 * Worker protocol:
 *   { type: 'SEARCH', state, difficulty, requestId? }
 *   -> { type: 'RESULT', move, requestId? }
 *   -> { type: 'ERROR', error, requestId? }
 */
self.onmessage = (event) => {
  const payload = event.data || {}
  if (payload.type !== 'SEARCH') return
  try {
    const move = chooseGomokuMove(payload.state, payload.difficulty || 'medium')
    self.postMessage({ type: 'RESULT', move, requestId: payload.requestId })
  } catch (error) {
    // Do not take down the game if a malformed state reaches the worker.
    console.error('[GomokuAI Worker]', error)
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
      requestId: payload.requestId,
    })
  }
}

