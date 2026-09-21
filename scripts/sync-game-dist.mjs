import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(projectRoot, 'columbina-game', 'dist')
const destination = path.join(projectRoot, 'public', 'game')

try {
  await stat(source)
} catch {
  throw new Error(`小游戏构建目录不存在：${source}`)
}

// dist 是小游戏的完整发布目录。同步前移除旧目录，避免内容哈希变化后
// 已失效的 JS、CSS 和图片长期累积为多个副本。
await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true, force: true })
console.log('已将 columbina-game/dist 同步到 public/game')
