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

// 小游戏 dist 是完整发布目录，同步前清空旧产物，避免不同构建 hash 文件累积。
await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true, force: true })
console.log('已将 columbina-game/dist 同步到 public/game')
