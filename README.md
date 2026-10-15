# Notebook Git Gutter

在 VS Code 原生 `.ipynb` 编辑器中显示 Cell 源码的 Git 行级变化。新增行显示绿色窄条，修改行显示蓝色窄条，删除行在附近显示红色三角。未保存的输入也会更新，恢复到基准后标记消失。默认延迟 200 ms。

## 安装和使用

需要 VS Code Desktop 1.141.0 或更高版本、Git，以及已启用的内置 Git 和 Notebook 支持。计算变化不需要 Python 或 Jupyter kernel。在扩展面板选择 **Install from VSIX…**，安装本地打包文件，也可以执行：

```sh
code --install-extension ./notebook-git-gutter-0.1.0.vsix
```

打开 Git 仓库中的 Notebook，直接编辑 Cell。Markdown 进入源码编辑状态时也会显示标记。悬停在有变化的源码行上可以查看简短说明和删除内容。底部 `NGG` 状态显示整 Cell 的新增、修改、删除和移动数量。删除整个 Cell 后，只在这里汇总。

命令面板提供 `Notebook Git Gutter: Toggle`、`Refresh` 和 `Show Diagnostics`。诊断包含版本、基准、Git API 状态及匹配统计，不记录源码、输出或凭据。

## 基准和配置

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `notebookGitGutter.enabled` | `true` | 启用行级标记 |
| `notebookGitGutter.baseline` | `HEAD` | 可选 `HEAD` 或 `index` |
| `notebookGitGutter.debounceMs` | `200` | 输入后的延迟，范围 0–2000 ms |
| `notebookGitGutter.showCellSummary` | `true` | 显示辅助 Cell 汇总 |

`HEAD` 比较内存源码和当前提交。`git add` 不会清除尚未提交的变化，提交或 checkout 更新 HEAD 后重新加载基准。`index` 比较内存源码和暂存区，stage、unstage 后重新加载基准。Git 状态更新依赖内置 Git 扩展；关闭其自动刷新时，可以执行本扩展的 `Refresh`。

无 HEAD 或所选版本中不存在该路径时，显示新增状态。读取失败、冲突和损坏 JSON 会明确显示错误，并清除该 Notebook 的标记。不能确定重命名前路径时，状态会注明 `new / unresolved rename`。不会猜测另一个文件作为基准。

## 远端和限制

在 Remote SSH / WSL 窗口中把扩展安装到远端。`extensionKind` 为 `workspace`，Git 在工作区所在的扩展宿主执行。当前视觉验收平台为 Linux，远端、Windows 和 macOS 尚未实际验收。未信任工作区、虚拟工作区和 Web 环境不受支持。

比较支持 nbformat 4 的代码和 Markdown 源码，忽略 outputs、execution_count 和无关 metadata。CRLF 统一为 LF，源码缩进、空白和末尾换行保留。唯一 Cell ID 优先匹配，缺少 ID 时使用内容、顺序锚点和有界相似度。重复内容无法区分、复杂拆分或合并时显示“暂未完成分析”。Raw Cell 暂不分析。

单个基准文件上限 8 MiB，单边最多 2000 个 Cell。两份 Notebook 的源码合计上限为 1600 万字符。单 Cell 比较的两份源码合计最多 512000 字符、20000 行，单次 diff 上限 20 ms 或 2000 次编辑。Cell 序列对齐预算为 50 ms，Notebook 分析预算为 150 ms，超限会显示未完成状态。`Refresh` 可重试。

图标使用浅色、深色和两种高对比主题的固定 SVG 配色。与断点、其他扩展共享 gutter 时可能重叠，不提供内置 Git gutter 的点击交互。所有 Git 读取均为本地只读操作，没有暂存、回滚或提交命令。

Git 子进程会隔离继承的 `GIT_*` 环境变量，防止读取被指向其他仓库。禁止读取触发远端传输或 remote helper。部分克隆缺少基准对象时显示读取错误，需要先由用户获取对象，再执行 `Refresh`。

## 开发和验证

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

F5 选择 `Notebook Git Gutter` 调试产品，或选择 `Native Notebook decoration probe` 手动运行独立渲染探针。演示文件为 `demo/demo.ipynb`。宿主和 UI 测试自动创建临时 Git 仓库及独立 VS Code 用户目录，不修改日常配置。Linux 无显示环境需要 Xvfb，Openbox 用于提供窗口焦点。首次运行会下载锁定的 VS Code 1.141.0，也可通过 `VSCODE_EXECUTABLE` 指定该版本的可执行文件。

UI 测试通过真实键盘输入修改源码，调用 VS Code 原生 Undo 和 Notebook reveal 命令进行撤销与滚动，使用测试专用 kernel 产生输出。真实截图和渲染节点检查保存在 `output/playwright/product/`，性能测量在 `output/performance.json`。这些测试工具和产物不进入 VSIX。

版本依据、API 路径和当前验收结果见 [VERIFICATION.md](VERIFICATION.md)。

## 发布到 Marketplace

在 [Marketplace 管理页](https://marketplace.visualstudio.com/manage) 登录 Microsoft 账户并创建 publisher。把 `package.json` 中的 `publisher` 改为自己拥有的 ID，保留扩展名 `notebook-git-gutter`。当前填写的 publisher 尚未核实归属或可用性。

运行 `npm run package` 和 `npm run test:vsix`，随后在管理页选择 `New extension → Visual Studio Code`，上传新生成的 VSIX。包名自动采用 manifest 的名称和版本。更新已发布扩展时，先执行 `npm version patch --no-git-tag-version`，再打包、验证并上传新版本。

命令行发布已有包可使用 `npx --no-install vsce publish --packagePath ./notebook-git-gutter-0.1.0.vsix`，认证方式见 [官方发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。这条命令会上传到市场，本项目的构建和测试脚本不会执行发布。`package.json` 已填写公开源码仓库，打包时会把文档的相对链接改写为该仓库 `main` 分支的链接。
