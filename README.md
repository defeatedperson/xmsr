# 星梦超分工具（XMSR）

免费的图片/视频超分与插帧桌面工具。基于 ncnn-vulkan 引擎，支持 NVIDIA / AMD / Intel 显卡。完全免费，无付费功能，可自由分享。

## 功能

- **图片超分**：支持 Real-CUGAN / Real-ESRGAN / waifu2x / realSR 四种引擎，2-4x 放大，降噪可选
- **视频超分 + 插帧**：ffmpeg 拆帧 → 超分 → RIFE/CAIN 插帧 → 合成（含音轨），四阶段进度
- **兼容性测试**：检测 CPU/内存/GPU/显存/Vulkan，自动推荐可用引擎与配置
- **磁盘空间检查**：任务前预估所需空间，不足时警告
- **成品库**：浏览输出目录的图片/视频，预览、删除、定位

## 技术栈

Electron + Vue 3 + Element Plus + ncnn-vulkan + FFmpeg + sharp

## 开发环境准备

### 1. 安装依赖

```bash
npm install
```

### 2. 资源准备（重要）

引擎和 ffmpeg 体积大（约 800MB），不入 Git 仓库。需要手动下载并放到 `resources/` 目录：

#### 引擎（6 个 ncnn-vulkan 引擎）

从各引擎的 GitHub Release 下载 Windows 版，解压后放入 `resources/engines/`：

| 引擎 | 下载地址 | 放置目录 |
|---|---|---|
| Real-CUGAN | https://github.com/nihui/realcugan-ncnn-vulkan/releases | `resources/engines/realcugan-ncnn-vulkan/` |
| Real-ESRGAN | https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases | `resources/engines/realesrgan-ncnn-vulkan/` |
| waifu2x | https://github.com/nihui/waifu2x-ncnn-vulkan/releases | `resources/engines/waifu2x-ncnn-vulkan/` |
| realSR | https://github.com/nihui/realsr-ncnn-vulkan/releases | `resources/engines/realsr-ncnn-vulkan/` |
| RIFE | https://github.com/nihui/rife-ncnn-vulkan/releases | `resources/engines/rife-ncnn-vulkan/` |
| CAIN | https://github.com/nihui/cain-ncnn-vulkan/releases | `resources/engines/cain-ncnn-vulkan/` |

每个目录里应包含对应的 `.exe` 和 `models` 文件夹。

#### FFmpeg

下载 FFmpeg Windows 静态构建，将 `ffmpeg.exe` 放到 `resources/ffmpeg/ffmpeg.exe`。

> GPL 说明：本项目合成视频使用 libx264 编码，要求 FFmpeg 为 **GPL 构建**（常见静态构建如 gyan.dev / BtbN 的 gpl 版本均满足）。依 GPL 协议，FFmpeg 的对应源代码可从 https://git.ffmpeg.org/ffmpeg.git 获取（网页浏览：https://ffmpeg.org ），按其构建配置自行编译。

#### 图标

将程序图标（512×512 PNG）放到 `resources/icon.png`。

### 3. 最终目录结构

```
resources/
├── icon.png                      程序图标（512×512）
├── engines/
│   ├── realcugan-ncnn-vulkan/    含 exe + models
│   ├── realesrgan-ncnn-vulkan/
│   ├── waifu2x-ncnn-vulkan/
│   ├── realsr-ncnn-vulkan/
│   ├── rife-ncnn-vulkan/
│   └── cain-ncnn-vulkan/
└── ffmpeg/
    └── ffmpeg.exe
```

## 开发与构建

```bash
# 开发调试（启动应用 + 热更新）
npm run dev

# 仅编译（不打包）
npm run build

# 打包 NSIS 安装包（生成 release/ 目录）
npm run build:win
```

打包产物：`release/星梦超分工具 Setup <version>.exe`

## 用户数据目录

- **配置**（小，C 盘）：`%APPDATA%\星梦超分工具\config\`
- **工作目录**（大，可迁移）：默认 `%APPDATA%\星梦超分工具\workspace\`，含 cache（缓存）、output（成品）

## 开源协议

本项目基于 **Apache-2.0** 协议开源。因内置 FFmpeg (GPL-2.0-or-later)，依 GPL 要求源码公开。

使用的开源组件及许可证详见程序内「设置 → 关于」或 [LICENSE](./LICENSE) 文件。

## 相关链接

- GitHub：https://github.com/defeatedperson/xmsr
- 官网：https://sr.xmpanel.cn
