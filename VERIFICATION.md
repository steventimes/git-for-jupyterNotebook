# 验收记录与复现

首次验证日期为 2026-10-08，安全修复和测试整合后的回归日期为 2026-10-15。平台为 Linux x64，VS Code Desktop 1.141.0，Git 2.43.0，构建工具 Node.js 24.18.0。GUI 在 Xvfb 的 1440×1000 虚拟显示中运行，截图来自实际 VS Code 窗口。测试使用独立用户目录、扩展目录和临时 Git 仓库。

## 版本和公开 API

选型时，[微软 stable 更新接口](https://update.code.visualstudio.com/api/update/linux-x64/stable/latest) 返回 1.141.0，提交为 `2a59476c9bfcb90b3ddc372c36762471b7dfad1c`。官方 Linux 归档的 SHA-256 实际核对为 `d77d588f0454cbaaa71e723497de4160d15b95fba4988abe177b1432e6bd570a`。

类型定义来自对应 [1.141.0 标签的 vscode.d.ts](https://github.com/microsoft/vscode/blob/1.141.0/src/vscode-dts/vscode.d.ts)，保存在 `types/vscode.d.ts`。当时 npm 的 `@types/vscode` 最新版为 1.140.0，因此使用官方版本快照。其 SHA-256 为 `a4321528e86dcdcb8450287f2a263055c46a622119cdb186de85ac3b19ce9608`。版本和校验信息也保存在 `types/VERSION.json`。

装饰路径为 `window.visibleTextEditors`，通过 `TextEditor.document.uri` 与 `NotebookCell.document.uri` 相等来定位编辑器，然后调用 `createTextEditorDecorationType({ gutterIconPath })` 和 `TextEditor.setDecorations`。监听可见编辑器变化、文本变化和 Notebook 结构变化。类型检查、真实宿主 API 调用和可见截图均已分别验证。

官方依据为 [API 参考](https://code.visualstudio.com/api/references/vscode-api)、[issue 114440](https://github.com/microsoft/vscode/issues/114440#issuecomment-765050520)、[decorator sample](https://github.com/microsoft/vscode-extension-samples/tree/main/decorator-sample) 和 [对应版本的编辑器同步源码](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/api/browser/mainThreadDocumentsAndEditors.ts)。

[内置 ipynb serializer](https://github.com/microsoft/vscode/blob/1.141.0/extensions/ipynb/src/deserializers.ts) 把 nbformat Cell ID 放在 `cell.metadata.id`。实现仅接受合法、唯一的 ID。Cell URI 用作当前会话身份，不作为永久 ID。

Git 仓库和状态监听使用 [内置 Git API v1](https://github.com/microsoft/vscode/blob/1.141.0/extensions/git/src/api/git.d.ts)。其仓库 getter 每次创建新包装对象，因此以 root URI 管理监听器。`show` / `buffer` 的 [实际实现](https://github.com/microsoft/vscode/blob/1.141.0/extensions/git/src/git.ts) 会启用 `--textconv`，所以读取使用参数数组调用本地 Git 的 `rev-parse`、`ls-files`、`ls-tree` 和 `cat-file blob`。每条命令限制 5 秒和 8 MiB 输出，禁用 fsmonitor、pager、replace objects 和可选锁。重命名只接受 API 明确提供的 rename 状态与旧路径，copy 不作为 rename。

本次审查复现了部分克隆缺失对象时的隐式远端读取。现在为 Git 设置 `GIT_NO_LAZY_FETCH=1` 和空的 `GIT_ALLOW_PROTOCOL`，后者也阻止 Git 2.43.0 的远端传输及 helper。子进程不继承 `GIT_*` 上下文、注入配置或 trace 目的地。临时仓库的写操作复用同一环境隔离，并单独禁用用户和系统 Git 配置及 hooks。Notebook 在逐 Cell 规范化前检查 2000 个 Cell 上限。

## 自动验证

| 入口 | 验证内容 |
| --- | --- |
| `npm run typecheck` | TypeScript strict，使用锁定的官方类型 |
| `npm run lint` | 源码、探针、脚本和测试 |
| `npm test` | 28 个核心用例及下述 8 组 Git 集成测试，共 36 个，无需 GUI |
| `npm run test:integration` | 只运行 8 组 Git 测试，含 HEAD/index、stage 后继续修改、无 HEAD、worktree、特殊路径、冲突、读取失败、promisor helper 阻断和继承环境隔离 |
| `npm run test:host` | 7 组真实宿主检查，含 URI 映射、未保存输入、debounce、增量计算、输出 metadata、Git 事件、禁用与关闭清理、多根、文件夹覆盖、rename 和嵌套仓库 |
| `npm run test:ui` | 实际渲染节点与 PNG 截图验证 |
| `npm run benchmark` | 生成输入后的实际分析耗时和重算数量 |

上述验证已实际运行。完整源码工作区中的宿主结果在 `.tmp/host-results.json`，UI 证据在 `output/playwright/product/evidence.json`。本次整合的命令日志在 `.tmp/test-consolidation/`。

旧单 Cell 自动测试及独立探针的重复自动交互已移除，F5 最小探针仍保留。Undo、Cell 插入、滚动和分屏的完整验收集中在 UI 套件，避免宿主重复执行相同流程。纯 generation 计数器测试并入实际异步分析用例，验证旧任务及关闭中的任务不会覆盖新缓存。重复的单 Cell ID 替换断言并入 2000 个 Cell 的边界用例。Git 安全回归全部保留。三个 VS Code 测试入口共用启动器和临时夹具，宿主与 UI 共用 Notebook 辅助函数。

本次 `npm audit` 查询了官方 npm 公告接口，生产和开发依赖均报告 0 个已知漏洞。类型快照 SHA-256、manifest 与 lockfile、JSON 配置、12 个 SVG 和扩展能力声明均已核对。首次宿主启动因受限执行环境的 Electron `EPERM` 失败，随后在允许的执行环境中运行通过，没有修改测试断言。

UI 流程包含三类未保存行级变化、其他 Cell 和输出焦点、滚动离开返回、Undo 清空标记、前插 Cell 不污染后续 Cell、输出更新、分屏一致、四种主题、禁用后重新创建编辑器、刷新、源码删空、Markdown 源码和预览状态，以及同一行断点。输入通过真实键盘事件，Undo 和滚动分别调用 VS Code 原生 undo 与 Notebook reveal API。输出由测试专用 NotebookController 产生，没有调用 Python kernel。截图不是生成的示意图。

## 性能测量

CPU 为 Intel Xeon Gold 6240R 2.40 GHz，系统报告 96 个逻辑 CPU。测量一次冷分析和 30 次连续热编辑，仅统计分析层，不包含 Git I/O、UI 绘制或默认 200 ms debounce。

| 输入 | 实测耗时 | 重算 Cell 数 |
| --- | --- | --- |
| 300 个 Cell，每个 40 行，冷分析 | 13.24 ms | 300 |
| 其中一个 Cell 编辑 | 7.07 ms | 1 |
| 同一 Cell 连续编辑 30 次 | 3.66–5.87 ms，均值 4.29 ms | 每次 1 |
| 在 300 个 Cell 开头插入 Cell | 4.02 ms | 1 |
| 单个 5000 行 Cell，修改一行 | 3.85 ms | 1 |

原始样本保存在 `output/performance.json`。这些数字是当前机器的一次测量，不是跨设备保证。

## 本地包验收

执行 `npm run package` 生成 `notebook-git-gutter-0.1.1.vsix`。随后执行 `npm run test:vsix`，把该 VSIX 安装到临时扩展目录，以独立测试 harness 运行相同的宿主套件，避免开发目录覆盖安装包。结果写入 `.tmp/vsix-host-results.json`。

VSIX 仅包含编译后的产品代码、SVG、插件图标、真实运行截图、运行时 diff 库及许可证、演示 Notebook 和中英文使用说明。本文中的开发步骤、验收记录、测试代码、浏览器工具、日志、类型快照和个人配置不进入包。安装方式见 README。

当前没有运行 Windows、macOS 或 Remote SSH / WSL 的 GUI 验收。Web 和虚拟工作区不受支持。复杂重复 Cell、拆分或合并可能无法可靠匹配，超出明确计算上限会显示未完成分析。默认断点与窄条在本次测试中可以共存，其他扩展的 gutter 装饰仍可能重叠。

## 构建与调试


使用 Node.js 22.13+ 和 npm。依赖版本由 `package-lock.json` 锁定。先运行 `npm ci --ignore-scripts`，随后可执行：

```sh
npm run typecheck
npm run lint
npm test
```

`npm test` 编译一次，运行 28 个单元测试和 8 组 Git 集成测试，不需要 GUI。构建会先清理 `out/`，避免已删除测试的编译产物继续残留。其他检查按需要运行：

| 命令 | 用途 |
| --- | --- |
| `npm run test:integration` | 单独排查 Git 集成问题，已包含在 `npm test` 中 |
| `npm run test:host` | 7 组真实宿主检查，覆盖缓存、Git 事件、资源释放和多仓库 |
| `npm run test:ui` | 原生 Notebook 的行级标记、Undo、Cell 插入、滚动、分屏及主题验收 |
| `npm run benchmark` | 测量大型 Notebook 和连续编辑的分析耗时 |
| `npm run package` | 生成本地 VSIX |
| `npm run test:vsix` | 对实际安装包运行同一宿主套件 |

宿主、UI 和 VSIX 检查共用 `scripts/run-vscode.cjs`。测试位于 `tests/unit/`、`tests/integration/` 和 `tests/vscode/`，Git 夹具统一放在 `tests/gitFixture.ts`。旧单 Cell 自动测试和重复的自动探针流程已移除，相关交互统一由 UI 测试验收。

F5 选择 `Jupyter Notebook Git Marks` 调试产品，或选择 `Native Notebook decoration probe` 手动运行独立渲染探针。演示文件为 `demo/demo.ipynb`。宿主和 UI 测试自动创建临时 Git 仓库及独立 VS Code 用户目录，不修改日常配置。Linux 无显示环境需要 Xvfb，Openbox 用于提供窗口焦点。首次运行会下载锁定的 VS Code 1.141.0，也可通过 `VSCODE_EXECUTABLE` 指定该版本的可执行文件。

UI 测试通过真实键盘输入修改源码，调用 VS Code 原生 Undo 和 Notebook reveal 命令进行撤销与滚动，使用测试专用 kernel 产生输出。真实截图和渲染节点检查保存在 `output/playwright/product/`，性能测量在 `output/performance.json`。这些测试工具和产物不进入 VSIX。



## 发布到 Marketplace


本项目的 publisher 为 `StevenYang0316-5274`，扩展名为 `notebook-git-gutter`。在 [Marketplace 管理页](https://marketplace.visualstudio.com/manage) 登录拥有该 publisher 发布权限的 Microsoft 账户。

运行 `npm run package` 和 `npm run test:vsix`，随后在管理页选择 `New extension → Visual Studio Code`，上传新生成的 VSIX。包名自动采用 manifest 的名称和版本。更新已发布扩展时，先执行 `npm version patch --no-git-tag-version`，再打包、验证并上传新版本。

命令行发布已有包可使用 `npx --no-install vsce publish --packagePath ./notebook-git-gutter-0.1.1.vsix`，认证方式见 [官方发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。这条命令会上传到市场，本项目的构建和测试脚本不会执行发布。`package.json` 已填写公开源码仓库，打包时会把文档的相对链接改写为该仓库 `main` 分支的链接。
