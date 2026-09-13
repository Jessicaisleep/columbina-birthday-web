# 服务器测试部署

当前目录的 `columbina-game-dist.zip` 是已经构建好的静态文件包，不需要上传 `node_modules`。

## 1. 上传构建包

在本机另开一个 PowerShell（或使用你已有的文件传输工具）执行：

```powershell
scp .\columbina-game-dist.zip root@120.48.112.243:/root/
```

SSH 会话中如果使用的不是 `root`，把用户名和目标目录替换成实际值。

## 2. 解压到独立目录

使用站点目录 `/var/www/columbina-game-test`：

```bash
mkdir -p /var/www/columbina-game-test
unzip -o /root/columbina-game-dist.zip -d /var/www/columbina-game-test
```

## 3. 启动静态文件服务

```bash
cd /var/www/columbina-game-test
nohup python3 -m http.server 80 --bind 0.0.0.0 >/tmp/columbina-game-test-80.log 2>&1 &
```

访问 `http://120.48.112.243/`。

如果 80 端口已有旧进程监听，应先确认对应进程，再停止旧进程后重新启动。不要重复启动多个服务实例。

## 4. 验证

打开首页后依次点击四个游戏入口，确认资源预加载、游戏进入、棋盘落子及重新开始均正常。浏览器开发者工具 Console 不应出现资源加载错误。
