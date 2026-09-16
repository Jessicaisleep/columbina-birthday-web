# 报名投稿后端（columbina-birthday-api）

《新月再梦听羽生》哥伦比娅生日会 —— 报名投稿的 API 服务。
纯 Node（`http` + `mysql2`），不依赖 Web 框架；静态页面仍由 nginx 托管，本服务只出 JSON。

## 跑起来

```bash
npm install
node index.js          # 默认 127.0.0.1:8788
```

配置全在 `config.json`：

| 字段 | 说明 |
| --- | --- |
| `port` / `host` | 监听地址，默认只监听本机，由 nginx 反代 |
| `dataDir` | 数据目录（默认 `data/`）：`data/uploads/tmp` 分片、`data/uploads/files` 合并后的附件 |
| `maxFileMB` | 单文件上限（默认 2048） |
| `defaultChunkMB` / `maxChunkMB` / `minChunkKB` | 分片大小范围（默认 4MB，客户端可协商） |
| `submitPerHour` | 同一 IP 每小时最多提交数（默认 20） |
| `retentionDays` | 未完成上传的保留天数（默认 7，每 6 小时清理一次） |
| `db` | MySQL 连接（`secretFile` 指向口令文件，不要提交进仓库） |
| `adminSecretFile` | 管理接口秘钥文件 |

## 数据库

库 `columbina_birthday`，启动时自动建表：

- `submissions` —— 一条投稿（联系方式、投稿形式、团队分工 JSON、单品信息、其他角色 JSON、进展、预览方式/链接、是否同意须知、IP、UA、创建时间、最后修改时间）
- `submission_files` —— 投稿附件元数据（本体在磁盘 `data/uploads/files/`，视频不进 BLOB）
- `upload_sessions` —— 分片上传会话（分片进度以磁盘为准，重启不丢）

建库 / 建账号示例（在服务器上执行，口令自定）：

```sql
CREATE DATABASE columbina_birthday DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'columbina'@'localhost' IDENTIFIED BY '<口令>';
GRANT ALL PRIVILEGES ON columbina_birthday.* TO 'columbina'@'localhost';
FLUSH PRIVILEGES;
```

口令写进 `data/db-secret.txt`（`chmod 600`，已被 `.gitignore` 排除）。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/uploads` | 新建分片上传会话 `{fileName,size,mime?,chunkSize?}` → `{uploadId,chunkSize,chunksTotal,received}` |
| GET | `/api/uploads/:id` | 查询已收到的分片（**断点续传**靠它拿 `received` / `uploadedBytes`） |
| PUT | `/api/uploads/:id/chunk/:index` | 上传单个分片（`application/octet-stream`） |
| POST | `/api/uploads/:id/complete` | 合并分片 → `{fileId,fileName,size}`（分片不全返回 409 + `missing`） |
| POST | `/api/submissions` | 提交投稿；字段校验不过返回 400 + `errors` |
| GET | `/api/submissions/:id` | 投稿回执（不含联系方式明文） |
| POST | `/api/submissions/lookup` | 按编号读回投稿：`{id}` → 完整字段 + 附件（修改前回显用） |
| PUT | `/api/submissions/:id` | 按编号**覆盖更新**（编号不变）：`keepFileIds` 保留原有附件，`fileIds` 新增 |
| GET | `/api/admin/submissions?tk=<adminSecret>` | 管理端列表（含联系方式与附件） |
| GET | `/api/admin/submissions/:id?tk=...` | 管理端详情 |
| GET | `/api/admin/files/:id?tk=...` | 下载附件 |

投稿表单里「投稿须知」必须勾选同意，**前端禁用提交 + 后端 `agreed` 必须为 true** 双重校验。

### 按编号修改（`lookup` / `PUT`）

投稿成功后拿到的 **32 位编号就是唯一凭据**：报名页右上角「我要修改」填入编号即可读回全部内容，改完直接覆盖原投稿。

- 读回（`lookup`）与修改（`PUT`）都按 IP 限流 **30 次 / 15 分钟**（与登录限流同一套内存计数），防脚本撞编号。
- 覆盖只换内容，`id` 与首次提交的 `ip`/`ua` 不动；`updated_at` 记录最后一次修改时间。
- 附件：`keepFileIds` 只能传「本来就属于这份投稿」的附件（越权会被当成没传，导致校验不过）；没保留的旧附件会**连磁盘文件一起删掉**。
- 校验规则与首次提交完全一致（同一份 `lib/validate.js`）：选了「上传文件」就至少得有一个附件。

## 看投稿内容

```bash
node tools/dump-submissions.js > all.json          # 全部导出 JSON
node tools/dump-submissions.js --csv out.csv       # 导出 CSV（Excel 可直接打开）
```

或走管理接口（需要 `data/admin-secret.txt` 里的秘钥）。**秘钥与数据库口令不要发到聊天里。**

## 目录

```
server/
├── index.js              # HTTP 服务 + 路由
├── config.json           # 配置
├── lib/db.js             # MySQL 连接与建表、数据访问
├── lib/upload.js         # 分片写入 / 合并 / 清理
├── lib/validate.js       # 投稿字段校验（后端为准）
├── tools/dump-submissions.js
└── data/                 # 运行期数据（已被 .gitignore 排除）
```
