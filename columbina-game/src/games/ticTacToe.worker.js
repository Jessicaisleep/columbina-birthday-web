import { getTicTacToeBestMove } from './ticTacToeAI.js'

self.onmessage = async (event) => {
  if (event.data?.type !== 'SEARCH') return
  try {
    const move = await getTicTacToeBestMove(event.data.state, event.data.difficulty)
    self.postMessage({ type: 'RESULT', move })
  } catch (error) {
    self.postMessage({ type: 'ERROR', error: error instanceof Error ? error.message : String(error) })
  }
}
