# Jupyter Notebook Git Marks

[English](README.md) | [简体中文](README.zh-CN.md)

在 VS Code 原生 Jupyter Notebook 编辑器中直接查看 `.ipynb` 的 Git 行级变化，尚未保存的输入也会更新。

- **绿色**标记新增行。
- **蓝色**标记修改行。
- **红色**在原位置附近标记删除行。
- Undo 恢复到基准内容后，标记自动消失。

![原生 Jupyter Notebook Cell 中尚未保存的新增、修改和删除标记](media/screenshots/line-changes.png)

## 开始使用

需要 VS Code Desktop **1.130.0+**、Git，以及已启用的内置 Git 和 Notebook 支持。计算源码变化不需要 Python 环境或运行 Jupyter kernel。

安装扩展，在 Git 仓库中打开已跟踪的 `.ipynb`，直接编辑 Cell。本地 VSIX 可通过 **扩展 → … → 从 VSIX 安装…** 安装。Markdown 进入源码编辑状态时也会显示标记。

在有变化的行号或标记区域右键，选择 **Jupyter Notebook Git Marks: Show Change**。VS Code 原生悬停框会在当前 Cell 内显示修改前后的源码，或删除内容及其位置。悬停在对应源码行上也能查看，不会另开编辑器。分屏时，请在需要查看的那一侧悬停源码。右键菜单无法识别点击的是哪个分屏，因此不会猜测并切换编辑器。

![在 VS Code 原生悬停框中查看修改前和删除的 Cell 源码](media/screenshots/change-details.png)

底部 **JGM** 状态汇总整 Cell 的新增、修改、删除和移动数量。整个 Cell 被删除后没有对应编辑器，因此只在这里汇总。

命令面板提供：

- **Jupyter Notebook Git Marks: Toggle**，开关标记。
- **Jupyter Notebook Git Marks: Refresh**，手动刷新。
- **Jupyter Notebook Git Marks: Show Diagnostics**，查看诊断。

## 选择比较基准

默认使用 **HEAD**，比较当前内存源码与最新提交。执行 `git add` 不会清除尚未提交的变化。

**index** 比较当前内存源码与暂存区。暂存或取消暂存 Notebook 后，基准随之更新。`git add -N` 只记录准备加入的文件，在真正暂存内容前按新增文件处理。

Git 变化通过 VS Code 内置 Git 扩展触发刷新。关闭 Git 自动刷新或需要重试读取时，可以执行 **Refresh**。

![同一个 Notebook 分屏打开后的 Git 标记](media/screenshots/split-view.png)

## 配置

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `notebookGitGutter.enabled` | `true` | 显示行级标记。 |
| `notebookGitGutter.baseline` | `HEAD` | 比较 `HEAD` 或 `index`。 |
| `notebookGitGutter.debounceMs` | `200` | 输入后的延迟，范围 0–2000 ms。 |
| `notebookGitGutter.showCellSummary` | `true` | 显示辅助 Cell 汇总。 |

## 兼容性与限制

支持 nbformat 4 的代码和 Markdown 源码。outputs、execution_count 和无关 metadata 变化不会产生源码标记。扩展不执行暂存、回滚或提交操作。

Remote SSH / WSL 窗口中需要把扩展安装到远端工作区。当前视觉验收平台为 Linux Desktop，Windows、macOS 和远端会话尚未实际视觉验收。不支持浏览器中的 JupyterLab、vscode.dev、虚拟工作区和未信任工作区。

等待分析时，发生编辑的 Cell 会暂时隐藏标记，避免把旧行号显示为当前结果。

已测试版本的 VS Code 内置 Git Quick Diff 不支持 Notebook Cell 模型。目前使用公开装饰 API，无法通过左键单击标记打开 Git 的内嵌差分弹窗。右键操作使用 VS Code 原生悬停框，不是 Git 的内嵌差分编辑器。红色小三角靠近行边界显示，但受 gutter 图标区域限制，无法像内置 Git 一样跨在两行之间。

每段源码预览最多显示 4000 个字符，超出时注明已截断。Cell 编辑后不会继续显示旧文档版本的预览。

基准文件上限为 **8 MiB，包含输出和 metadata**，最多支持 2000 个 Cell。单 Cell 差分的基准与当前文本合计不超过 512,000 个字符和 20,000 行，Notebook 基准与当前源码合计上限为 16,000,000 个 UTF-16 单元，另外还有计算时间预算。超限时会明确显示未完成分析或无法比较。

Git 只执行本地读取，同时最多运行 4 条命令，最多排队 128 条。队列满时会明确提示，可以在读取结束后执行 **Refresh**。

Raw Cell、无法区分的重复 Cell、缺少可信 ID 或会话身份时同时移动和修改的 Cell、复杂拆分或合并及超限输入会显示未完成分析。读取失败和合并冲突会显示错误，不会误当成空基准。行号旁的标记可能与断点或其他扩展的装饰重叠。

## 许可证

0.1.1 及后续版本采用[源码可用许可证](LICENSE)，不属于标准开源许可。允许学习、个人和组织内部使用、修改及注明来源的源码 fork。未经事先书面许可，不得将其作为扩展重新上架或公开分发 VSIX，也不得冒认复制代码的原创作者。

[历史 MIT 版本](LICENSES/MIT-legacy.txt)的既有授权继续有效，新条款不能追溯收回这些权限。[第三方组件](THIRD_PARTY_NOTICES.md)保留各自许可证。

官方 publisher 为 **StevenYang0316-5274**。[源码与问题反馈](https://github.com/steventimes/git-for-jupyterNotebook)。
