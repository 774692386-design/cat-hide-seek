# 喵星人躲猫猫大作战（在线多人版）

一个可部署的多人在线 3D 网页游戏。使用 Node.js、Express、Socket.IO 和 Three.js。

## 已实现

- 创建房间并生成 6 位邀请码
- 朋友输入邀请码加入（每房最多 8 人）
- Socket.IO 同步玩家位置、朝向、变身状态、柴犬位置和回合状态
- 房主开始 90 秒回合
- WASD / 方向键移动；手机屏幕左下角虚拟摇杆移动
- 变身成纸箱、盆栽、玩具、圆桶、沙发、落地灯；可恢复小猫
- 柴犬警长追逐最近的存活小猫；家具形态暂时免疫抓捕
- 手机和桌面浏览器自适应

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install
npm start
```

浏览器访问 http://localhost:3000

同一局域网的朋友可访问运行服务器电脑的局域网 IP，例如 `http://192.168.1.20:3000`。

## 部署到公网（Render 示例）

1. 将本项目解压并推送到 GitHub 仓库。
2. 在 Render 创建 **Web Service**，连接该仓库。
3. Runtime 选择 Node，Build Command 填 `npm install`，Start Command 填 `npm start`。
4. 部署完成后，把 Render 提供的 `https://...onrender.com` 地址发给朋友。
5. 所有玩家打开同一网址，创建或输入邀请码即可联机。

也可部署到 Railway、Fly.io、Render 等支持长期运行 Node Web Service 和 WebSocket 的平台。请不要部署到只支持静态文件的托管方式；多人同步需要持续运行的 Node 服务。

## 注意

- Three.js 从 cdnjs CDN 加载，玩家浏览器需要能访问该 CDN。
- 当前版本是可玩的联机原型：房间存在于服务进程内存中，服务器重启后房间会消失。
- 建议先小规模测试网络延迟和手机性能，再公开分享。
- 生产环境可进一步增加房间密码、断线重连、服务端碰撞检测、反作弊、持久化排行榜和更完善的地图/动画。
