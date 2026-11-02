# 已验收闭环归档

本文件归档六项已有经理验收的本地闭环，保留原日期、范围、产物身份、失败和执行偏差。
“完成”只指各次声明的限定范围，不是当前工作树、其他平台或发布资格的再次验收。
当前未完成项及资料采用状态见[活动记录](verification.md#2026-10-29-当前资料采用状态)。
下列正文从原验收记录移入，未改写原结论。原始回执、截图和 before 材料没有迁移或删除。

## 2026-10-28 当前候选安装态 UI 双版本验证

在 Linux Desktop 的独立 profile 中，分别用最低支持版 VS Code 1.130.0 和当时的 stable
1.143.1 安装同一 F5 候选 VSIX，SHA-256 为
`09cfc3882413148c50a3d6d3ee03409533ca1afd315a175565aa17a486fb922d`。官方
[版本目录](https://code.visualstudio.com/updates/archive)列出 1.143 为最新正式版、1.144
为 Insiders，[1.143 发布说明](https://code.visualstudio.com/updates/v1_143)列出的下载版为
1.143.1。原始候选与当前源码除本文件及工作流外的 F5 身份一致；各次安装的 209 个运行及
依赖文件与当前构建逐字节一致。

各版本均在真实原生 Notebook 窗口通过九个编辑与标记检查点：键盘编辑、保存并在独立
clone 中实际暂存、HEAD/index 不同内容切换、暂存后再次键入、键盘 Undo 恢复 index
基准并清除标记。随后在另一个 Cell 键盘编辑，验证上一／下一变更 Cell、首尾循环和
无可导航变更的提示。导航由扩展命令调用，编辑与 Undo 是实际键盘事件；基准切换和保存
通过宿主 API。截图与宿主结果分开保存在 `output/batch-P1-notebook-git-20261028/`。
原生 Show Change 和 uncertain 行为没有在本轮重复测试，沿用既有 F5 证据。

两次运行退出码均为 0；测试进程分别耗时 14.35／14.09 秒，最大 RSS 306264／231860 KiB，
不表示扩展延迟。未调用会创建 commit 的旧 fixture：测试仅从现有 HEAD 创建临时 clone，
在其中暂存，没有创建 commit。原 A1 blocked 回执保留为历史记录；本次没有修改产品或 CI，
也未验证其他操作系统、真实 SSH／WSL 或远端 CI。

## 2026-10-28 变更 Cell 导航

命令面板新增 **Previous Changed Cell** 和 **Next Changed Cell**。两者复用当前 Notebook
已完成的分析快照，按当前 HEAD/index 基准选择确定新增、修改或移动的 Cell，选择并滚动到
目标；首尾循环。分析未就绪、不可用或没有目标时提示；跳过不确定的 Cell，整 Cell 删除
没有可定位的现存 Cell。现有 gutter、Show Change 和基准设置保持不变。

在 Linux Desktop / VS Code 1.143.1 的隔离 profile 中安装本轮构建的 0.1.5 VSIX，使用
本项目已有 HEAD 的本地 clone，暂存不同的 Notebook 内容并继续内存编辑。真实窗口与宿主
分别确认两条命令注册、命令面板调用、HEAD/index 不同结果、前后循环和选中的 Cell；
目标初始在视口之外的输入还验证了滚动到目标。另一个真实重复 ID 输入中两个 Cell 的
匹配为 uncertain，导航跳过它们并定位确定修改；分析未完成和无变更时，真实窗口显示提示
且选中位置不变。截图、宿主快照、基准内容、驱动和日志在
`output/batch-F5-notebook-git-20261028/` 及同前缀 `-scroll`、`-ambiguous`、`-clean`。
重复 ID 测例有意违反 nbformat 唯一性约束；没有以颜色推断导航目标。

`npm run typecheck`、`npm run lint`、37 个单元测试通过；四个隔离窗口流程退出码均为 0。
窗口流程耗时分别 9.49、9.50、7.74、7.48 秒，最大 RSS 分别 234260、227692、234332、
232360 KiB；这些是测试进程数据，不是产品延迟。首次受沙箱子进程限制的正常打包返回入口
缺失，随后获准在沙箱外重试正常打包并确认包含 diff 依赖；`--no-dependencies` 试验包未用作
验收。产品包 SHA-256 为 `09cfc3882413148c50a3d6d3ee03409533ca1afd315a175565aa17a486fb922d`。
旧运行态 fixture 含 commit，本轮未调用；仅在任务私有 clone 暂存测试内容，未创建 commit。
临时副本和 profile 已释放，原始证据保留。没有运行 Actions、集成套件或旧宿主 fixture；
Windows、macOS 与真实 SSH/WSL 的本次导航视觉效果尚未验证，也未发布或推送。

## 2026-10-28 旧 Notebook 的 Cell 身份

在 Linux Desktop / VS Code 1.143.1 的独立 profile 中安装同一 0.1.5 VSIX，分别打开
两个临时 Git 仓库中的真实 Notebook：nbformat 4.4 的 41 个 Cell 全部缺失 ID；另一个
nbformat 4.5 输入有两个 `fixture-0` ID（重复 ID 不符合格式唯一性要求）。两组输入中
HEAD 和 index 的目标 Cell 源码不同。已核对各自安装的 138 个运行时／依赖文件，以及
输入源码和包身份与 R3 一致；没有修改产品或 serializer。

打开前、实际 NotebookDocument 的 Cell metadata、键盘编辑并保存后的实际 `.ipynb` 均
留存于各场景证据。缺失 ID 的 41 个 Cell 打开及保存后仍全部无 ID；重复 ID 的两个
Cell 打开及保存后仍为 `fixture-0`，本次 serializer 未生成或归一化这些 ID。这是对该
版本真实输入的观察，不依赖构造内部 Cell 或伪造 serializer 输出。

两种输入各通过 10 个实际窗口检查点：目标 Cell 移动前 HEAD 显示蓝条、index 无标记；
移动后在 HEAD 下扩展标为“分析未完成”且不画错标，index 无多余标记；一次真实键盘
Ctrl+Z 撤销移动后，Cell URI 与顺序恢复，HEAD 蓝条重新出现、index 仍无标记。随后
在 Cell 内实际键入并保存，index 下对应蓝条出现。人工检查不确定状态和撤销后的截图。
移动使用 VS Code 命令，基准切换及保存通过宿主 API；源码输入和 Undo 使用键盘。宿主
快照、真实 gutter 图标和原始 `.ipynb` 分开保留。移动且源码不同、缺少可靠 ID 时采取
保守结果是已有明确限制，不将未画标记误称为源码相同。
两类输入的宿主快照在不同阶段记录 `similarity`、`exact` 和 `session` 匹配；移动后
HEAD 的不确定 Cell 没有确定配对，原因是 `Ambiguous cell alignment`。

可复现驱动和证据分别在忽略目录 `output/batch-R4-notebook-git-20261028-missing/`、
`output/batch-R4-notebook-git-20261028-duplicate/`。仓库根目录分别运行
`NGG_SCENARIO=missing VSCODE_VERSION=1.143.1 node output/batch-R4-notebook-git-20261028-missing/runner.cjs`
和 `NGG_SCENARIO=duplicate VSCODE_VERSION=1.143.1 node output/batch-R4-notebook-git-20261028-duplicate/runner.cjs`。
缺失 ID 运行退出 0、10.34 秒、最大 RSS 231,848 KiB；重复 ID 运行退出 0、10.39 秒、
最大 RSS 236,880 KiB。两项为测试进程测量，不代表产品延迟。临时 Git 仓库、独立 profile
与自有 CDP 端口已释放；原始证据保留。

未发现可复现产品缺陷，没有重新打包或重跑同身份已有套件；本轮不追加新任务。Windows、
macOS、真实 SSH／WSL 的视觉验证仍需对应环境。未运行 Actions／act 或远端 CI，未提交、
推送项目仓库，也未发布或部署。尽管本轮要求禁止 commit，复用的测试夹具为建立 HEAD，
在两个临时 Git 仓库各执行了一次 commit，构成操作边界偏差；临时仓库已删除，没有提交
项目工作树。

## 2026-10-28 不同基准下撤销 Cell 移动

在独立临时 Git 仓库中，HEAD 的首个 Cell 为 `Notebook 0`，index 则暂存了 `Staged baseline`；
两者通过 Git 实际读取确认不同。分别在 Linux Desktop 的 VS Code 1.143.1 和最低版
1.130.0 独立 profile 安装现有 0.1.5 VSIX，均核对 138 个运行时／依赖文件与现有构建一致。
输入源码与 R2 清单一致，VSIX SHA-256 为
`faab9393cc457ecd9958b8927715b176b7a6f4d19921f4574974ab65502a5669`。

先在 HEAD 下看到目标 Cell 的蓝条，切换 index 后蓝条消失；把该 Cell 移到 Markdown 后，
HEAD 的蓝条跟随目标 Cell，index 下没有多余标记。通过一次真实键盘 Ctrl+Z 撤销移动，
宿主记录第二次 Notebook 结构变化且原 Cell URI 回到原位；切回 HEAD 后蓝条仍在原位，
index 下没有残留。两版各 8 个窗口检查点通过，已人工查看关键截图。移动使用 VS Code
命令，基准切换通过宿主配置 API；撤销是实际键盘事件。桥接快照和真实可见 gutter 分开
记录，不将 API 调用视为视觉证据。

可复现驱动、输入指纹、实际基准及截图分别在忽略目录
`output/batch-R3-notebook-git-20261028/` 和 `output/batch-R3-notebook-git-20261028-min/`。
在仓库根目录以 `VSCODE_VERSION=1.143.1 node output/batch-R3-notebook-git-20261028/runner.cjs`
或 `VSCODE_VERSION=1.130.0 node output/batch-R3-notebook-git-20261028-min/runner.cjs` 运行。
前者退出 0、9.22 秒、最大 RSS 228,988 KiB；后者退出 0、10.09 秒、最大 RSS 303,288 KiB；
为测试进程计量，不代表产品延迟。测试仓库和 profile 已释放，两次自有端口不再监听。

没有发现需修复的产品缺陷，未修改产品代码或重新打包。现有单元测试覆盖缺失 ID 的
精确源码移动和重复 ID 降级，但尚未找到同身份安装包对缺失／重复 nbformat Cell ID
移动与撤销的真实 UI 证据，这是可在本机进一步核对的具体缺口，不代表已发现故障。
Windows、macOS、真实 SSH／WSL 视觉验收仍需对应环境。本轮未运行 Actions／act、远端 CI，
也未提交、推送、发布或部署。

## 2026-10-28 安装包中的 Cell 移动与编辑

本轮在 Linux Desktop / VS Code 1.143.1 的独立用户目录中安装现有 0.1.5 VSIX，
核对 138 个运行时／依赖文件与当前构建一致。包 SHA-256 为
`faab9393cc457ecd9958b8927715b176b7a6f4d19921f4574974ab65502a5669`；输入 HEAD 为
`908483588fcd62cedb545caaece5aca95b51af4c`。产品源码和 VSIX 未修改。

真实 Notebook 将首个代码 Cell 移到 Markdown Cell 后：HEAD 和 index 均不出现源码行
标记；在移动后的 Cell 输入未保存修改，两种基准均在该 Cell 显示蓝条；六次原生 Undo
恢复原源码后，两种基准均无可见残留标记。8 个界面检查点通过，并人工查看修改和撤销
后的截图。宿主桥按 Cell URI、索引、源码版本和分析状态核对；真实窗口分别检查图标
位置。移动使用 VS Code 命令，基准切换使用宿主配置 API，输入和 Undo 使用键盘事件。
本次 HEAD 和 index 内容相同；暂存后继续编辑的不同基准情况沿用上一轮同身份验证。

可复现脚本与证据在忽略目录 `output/batch-R2-notebook-git-20261028/`。仓库根目录运行
`VSCODE_VERSION=1.143.1 node output/batch-R2-notebook-git-20261028/runner.cjs`，使用
已编译辅助代码、独立临时 Git 仓库与 profile。最终运行退出 0，耗时 9.96 秒、最大
RSS 232,168 KiB，为测试进程测量，不代表产品延迟。端口清理检查在默认沙箱中因 socket
权限失败；正常提权后确认临时仓库和 profile 已删除、测试端口未监听。

本轮未发现需要修复的产品缺陷，没有重跑同身份完整套件或 Actions／act。移动动作本身
的 Undo、不同 OS、真实 SSH／WSL 和不同 HEAD/index 内容下的移动不属于本轮新增覆盖。

## 2026-10-27 实际安装包的连续编辑闭环

已验证 0.1.5 VSIX 在 Linux Desktop / VS Code 1.143.1 的连续编辑行为。包仍为
593,163 bytes，SHA-256 为 `faab9393cc457ecd9958b8927715b176b7a6f4d19921f4574974ab65502a5669`。
56 个来源文件（本记录除外）与既有安装验收一致；独立 profile 中实际安装的 138 个
运行时／依赖文件逐项匹配当前构建和既有安装清单。产品从该 profile 的 extensions
目录加载，开发路径仅提供空测试 harness，没有加载工作区产品作为开发扩展。

本轮补齐同一安装包中的真实消费者流程：键盘修改首个 Cell → 保存并暂存 → 切到 index
后无标记 → 继续键盘输入且不保存 → HEAD/index 来回切换均有修改标记 → 六次原生 Undo
回到暂存源码后 index 标记清空 → HEAD 仍显示暂存源码相对提交的修改 → index 再次清空。
九个检查点均通过。浏览器分别检查实际可见 gutter 图标及其坐标、保存窗口 PNG；宿主桥
另记录源码、dirty、基准、revision 和分析状态。暂存快照确认 HEAD 与 index 源码不同，
index 不含后续未保存输入。人工查看 `04-index-unsaved.png` 和
`07-undo-index-no-ghost.png`，确认首个 Cell 的蓝条出现及撤销后的清空。

证据及可复现 runner/host/driver 位于忽略目录
`output/batch-R1-notebook-git-20261027/`。在仓库根目录执行
`VSCODE_VERSION=1.143.1 node output/batch-R1-notebook-git-20261027/runner.cjs`，
复用现有运行时／夹具和已编译测试辅助代码；本轮没有重新编译、打包或修改产品。
启动器创建独立临时 Git 仓库、扩展与用户目录、自有 Xvfb 和动态本机 CDP 端口，退出后
释放夹具。配置切换与保存／暂存通过真实宿主 API 完成，源码输入和 Undo 使用键盘事件；
不把 API 桥快照单独当作可见 UI 证据。

首次沙箱执行在本机端口监听处报 EPERM，正常提权后的首轮 UI 在撤销检查失败：驱动误以为
一次 Undo 能撤回整行键盘输入，实际 VS Code 按输入片段分组。原日志和失败快照保留在
`run-desktop.log`、`failed-first-ui/`；修正仅限私有驱动，逐次等待源码变化后撤销至暂存
源码。最终 `run-final.log` 退出 0，`run-final.time` 记录 10.95 秒、最大 RSS 234,396 KiB；
这是本机一次测试进程统计，不是产品输入延迟或隔离性能测量。tokens／费用未测量。

本轮未发现可复现产品缺陷，只更新本记录并留存缺失的安装包视觉证据。同身份的最低版
安装和两版完整 UI 继续引用既有记录，没有重复宽泛套件。没有运行 Actions／act、远端 CI，
也未提交、推送或发布。Cell 移动、其他 OS、真实 SSH／WSL 与原生 hover 的完整交互不属于
本轮新增证据；既有平台和 API 限制保持原记录范围。先定稿本记录，再生成任务私有最终
清单；清单排除自身、回执及交接正文，避免递归哈希，不修改经理管理文件。
