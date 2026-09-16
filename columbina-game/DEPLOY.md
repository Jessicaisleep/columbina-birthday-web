# 小游戏单独部署（可选）

游戏本身是纯静态产物，可以独立部署到任意静态服务器或托管平台。

```bash
npm ci
npm run build          # 产物在 dist/
```

```bash
# 上传并解压（<用户>@<服务器> 换成你自己的）
scp dist.zip <用户>@<服务器>:~/
ssh <用户>@<服务器>
unzip -o ~/dist.zip -d <静态目录>
```

nginx、GitHub Pages 或任意静态托管都能直接跑；临时验证也可以用 `python3 -m http.server`。

部署后打开首页，依次点四个游戏入口，确认资源预加载、进入游戏、棋盘落子与重新开始都正常，控制台无资源加载错误。
