# Magpie Fingerprint

[English](README.md) · [Magpie](https://github.com/yetone/magpie) · [lm-detector](https://github.com/Ikaleio/lm-detector)

在 Magpie 中直接比较不同 provider、不同模型的响应指纹，复用已有登录与网关配置。检测与评分基于 `lmfpd-sdk`，展示参考库中的相近候选。

![检测界面，图中为明确标识的示例数据](docs/preview.png)

- 一批最多选择 24 个模型，共用三个挑战，便于横向比较。
- 实时显示采样数量与状态，支持取消、总超时和并发设置。
- 保存实际路由、原始回答、推理参数与参考库版本。
- 展示候选排名、模型家族和部分样本等状态。
- 复用 Magpie 原生页面桥接、控件样式与设计变量，主题和语言跟随宿主。
- 本地历史、JSON 导出与复制；紧凑列表、键盘切换与窄屏布局。

## 定时检测与总览（本 fork 新增）

- **总览页**：默认打开即见。每个模型一行，直接显示最近一次检测的指纹结论、置信度、平均首字延迟（TTFT）、近似输出速度（token/s）、检测时间，以及与上一次检测的置信度趋势对比；点击行内展开完整详情，无需在历史与检测页之间来回跳转。每行还带「立即检测」按钮，一键单测该模型。
- **性能指标**：采样代理在流式响应中记录首字延迟与生成耗时，token/s 按输出字符数 ÷4 近似估算；样本详情卡片中直接展示。
- **定时检测**：在总览页设置启用开关、间隔（分钟）与模型列表（逗号分隔），保存后 Magpie 主程序运行期间即按计划自动检测，无需打开插件页面；设置持久化到数据目录（`autorun.json`），重启后按 `nextRunAt` 恢复。也可在 Magpie 插件选项中预设 `autoIntervalMinutes`、`autoModels`、`autoEffort`。

> 说明：指纹结论可用于发现「降智」迹象——例如标称模型实际路由到参考库中的另一个（更小的）模型，或同一模型置信度突然下滑。

## 从 GitHub 安装

仓库包含可直接安装的 `dist/` 构建文件。在 Magpie 的 **Plugins** 中添加 `github:KaranocaVe/magpie-fingerprint`。也可执行：

```sh
magpie plugin add github:KaranocaVe/magpie-fingerprint
```

需要支持 `page.service` 的当前 Magpie 版本和 Bun 1.4.2+。启用后，从侧栏「模型指纹」或 provider 菜单「检测指纹」进入。点击开始会为每个模型发送三条采样请求，消耗对应通道的额度。

## 开发

```sh
bun install --frozen-lockfile
bun run check
bun start
```

页面服务默认监听 `3488`，通过 `http://127.0.0.1:3425` 使用 Magpie 网关。网关认证、`magpie web`、环境变量和显式的 `--demo` fixture 见 [integration.md](integration.md)。

## 范围与限制

首版实现数字指纹，分词器探测留待后续。概率只在参考库候选中分配，不能当成模型身份的证明。Magpie 的 middleware 和协议适配仍会生效；检测到实际 provider/model 变化时，该目标停止评分。固定账号可选，支持填写账号标识；已缓存的订阅账号可供补全。

`bun start --demo` 提供独立的示例模式，不调用真实模型。任务被宿主重启打断后会标为「已中断」，保留已收到的回答。

采用 MIT 许可证。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
