# 验收记录与复现

使用说明：[English](../README.md) · [简体中文](README.zh-CN.md)；开发入口：[构建与调试](#构建与调试) · [发布](#发布到-marketplace) · [历史记录](#历史验收记录)。

## 2026-11-02 最终本机预检与 Node 更新

构建环境更新为 Node.js 24.22.2、npm 11.19.1，CI 两个 job 固定同一版本，
package 与 lockfile 的构建要求同步为 `^24.22.2`。四类官方 Action 改用 Node 24
执行环境并固定完整提交 SHA。历史记录中的旧运行时版本不变。

在 Ubuntu 24.04.5 x64 的隔离公开文件副本中，`npm ci --ignore-scripts`、typecheck、
lint、单次打包、47 项单元／Git 集成和性能入口均通过，工作流静态检查通过。
同一份 0.1.7 VSIX 在最低版 1.130.0 与本次官方解析的 stable 1.144.0 中实际安装，
两版各通过 11 组宿主检查和 45 个真实 UI 检查点，138 个运行成员均与当前构建一致。
覆盖未保存编辑、HEAD/index、暂存后续改、Undo、变更 Cell 导航、中文／长行 hover
和装饰清理。测试与生产均为 1489 非空行，未修改产品逻辑或测试断言。

VSIX SHA-256 为 `2edc898a3f6e5f9851105494687ca1d7f8417fd33ffa31f105d22e187e18488b`。
日志、截图、文件摘要与完整增量在 `output/batch-NOTEBOOK-FINAL-PREFLIGHT-20261102/`。
本节记录本机验证。远端 CI 以准确提交的运行记录为准，Marketplace 发布不在本次范围。
Windows、macOS、真实 SSH／WSL 仍未在本轮验证。

Node 升级不等于依赖审计全部通过。当前锁定开发依赖链仍有 14 项审计告警，其中
2 项 high 来自打包工具的间接依赖，未执行自动修复。此次审计未报告生产依赖 diff。
最低版兼容检查使用已有缓存，其内置 Node 24.18.0 由 VS Code 自身维护，未修改
安装文件或重新下载旧运行时。日常使用建议保持 VS Code 更新。

## 2026-11-02 attempt 2，按覆盖包含关系去重

测试从 1753 减至 1489 非空行，生产源码保持 1489 行，比例为 1:1。
保留更强的多 Cell、重复词／Unicode、缓存与预算场景，删除其已包含的基础单测。
真实 UI 取代重复的宿主激活、raw 切换和输出检查，并增强为“先改源码再切 raw”及
“输出与任意 metadata 同时变化且不重算”。初始渲染探针、原生 glyph 点击／Quick Diff
一次性能力调查和逐 hover 排障日志退役，固定源码快照、失败和截图保留，未迁移测试归属。
原生 Show Change、安全围栏／链接、大小上限、歧义身份、错误恢复和生命周期合同保留。

类型、lint、47 项核心／Git 集成、两版各 11 组安装态宿主及完整真实 UI 均通过。
Linux 版本为最低版 1.130.0 与记录稳定版 1.143.1；同一既有 0.1.7 VSIX 的 138 个
运行成员相符。私有副本的偏移错一位与跳过完整评估门槛两个负控均被保留测试检出。
该轮没有修改产品、依赖或包，没有提交、推送或发布。以上结果只对应该轮固定输入，
最终文件集的本机门禁另行记录。
映射、计数、负控及证据在 `output/batch-NOTEBOOK-TEST-TRIM-A2-20261102/`。

## 2026-11-02 attempt 1，历史部分交付

按原统计口径复算，生产源码保持 1489 非空行，测试从 1763 减至 1753 行，仍超上限
264 行，测试／生产为 1.177。开发工具、声明、benchmark 和归档仍按原规则排除，
没有增加生产分母、压缩格式或改动归属。该比例要求尚未完成，未提交或推送。

宿主中重复的单字与长行预览交给已有真实 UI 的逐字高亮、上下文收缩和安全断言保护；
保留真实 TextDocument 的未改动上下文链接安全检查，去掉为该重复场景建立基准的两次
fixture commit。40 个单元场景不变，缓存、预算、不可靠身份和生命周期回归保留。
未找到能继续安全删减 264 行的重复测试，不以移除独立回归满足比例。

本轮 typecheck、lint、56 项单元／Git 集成，以及两版各 14 组安装态宿主检查通过。
产品、UI 驱动及 0.1.7 包未改，复用 11 月 1 日同包的完整 UI 证据，未重跑 UI。
本轮不是完整 push 前 CI 预检，没有将本机 Node 24.22.1 结果等同于 workflow 的
Node 24.18.0，也没有重跑 npm ci／打包／benchmark。原始计数、场景映射、增量与
依赖说明在 `output/batch-NOTEBOOK-TEST-TRIM-20261102/`，待经理核对范围和未完成项。

## 2026-11-01 Controller 与 CI 收尾

RF-10 已完成行为保持重构，待经理验收。文本变化、语言变化、Notebook 结构／身份变化、
Git 基准变化和关闭 Tab 各有清楚命名的操作；展开排队、分析提交、错误与 dispose 的多语句
控制流。debounce、generation、旧结果失效、事件及释放顺序保持。没有新增模块层或生产依赖。

AR-05 保留 quality 只构建一次 VSIX、矩阵消费同一 artifact 的设计。push 限 main，
纯 Markdown／docs 变更不触发 push 检查；PR 不过滤，保留门禁与手动触发。quality 通过
独立 prepublish 编译后直接执行原编译测试和性能入口，矩阵每个 job 只编译一次。
`run.cjs ui <vsix-path>` 与宿主入口复用安装成员、源码和包摘要核对，写入独立
`output/ui-release.json`。默认开发模式仍保留，不能把两者混为一谈。

本轮 typecheck、lint、56 项单元／Git 集成及打包通过。原 actionlint 因沙箱 namespace
限制返回 incomplete，获准使用同一隔离检查器后静态通过。Linux 1.130.0 与记录稳定版
1.143.1 各通过 14 组实际安装包宿主检查；最终驱动在两版的完整安装态 UI 均通过。
每版核对 138 个实际安装 runtime／依赖成员，同一包的源码、构建与安装摘要绑定保存。

最低版最初的中文长行 hover 失败已定位并收敛。同一次失败后沿源码移动鼠标即可显示
中文前后预览；provider 与源码内容未变化。驱动现等待焦点切换后的源码布局稳定，
再用真实鼠标进入，避免对长行执行自动滚动的 locator hover。转义源码场景也先等待
实际 gutter 绘制。中文原文、旧值／新值、CJK／emoji 实际字体、转义内容与四种主题的
原断言保留，没有增加超时、换成 API 结果断言或修改产品 hover 实现。

此前 UI 还复现了详情浮层挡住源码点击、语言切换后测试 kernel 未关联。驱动现先移开
鼠标并等待浮层消失，产出测试输出前用真实选择器选回已有测试 kernel。
初始失败、鼠标对照、滚动诊断及最终两版成功证据均保留在
`output/batch-BACKLOG-NOTEBOOK-GIT-20261101/`；成功截图只按本次 evidence.json 的步骤取用，
不混用其他运行留下的图片。本轮后续授权允许测试在自有临时仓库创建 fixture commit，
实际运行仅写测试仓库，目标仓库 HEAD 与 index 条目保持，未切换分支或改动 remote。

新本地候选仍为 0.1.7，VSIX SHA-256 为
`b1a16e5c1c12dbba59a6204356e85fb4c26350260ee63d946df03302ee293843`。
它与 10 月 29 日同版本包身份不同，旧包已保留。本地定向验证已收尾，待经理审阅提交准备。
没有运行 Actions／act、提交、推送或发布；1.143.1 是记录稳定版，未重新查询最新版本。
真实 SSH／WSL 和其他 OS 仍未验证，历史 A1 blocked 回执保持原样。

## 2026-10-29 0.1.7 最终候选定向补证

W49／W53 本地工作已交付，待经理与监督验收。本轮将 manifest、锁文件及更新日志同步为
0.1.7，产品源码、编译结果及依赖树与此前 0.1.6 一致。用户已确认上传 0.1.6，本轮没有
下载远端包比对，也没有发布 0.1.7。最终 VSIX 为 `output/packages/notebook-git-gutter-0.1.7.vsix`，
SHA-256 为 `2bffba9e86ff2c810d325aafd8af2a4db7e3f53d7518df64843ef2cd72a102ed`。

在最低支持版 1.130.0 与记录稳定版 1.143.1 分别运行两个既有无 commit 安装态 UI 场景。
四次运行均退出 0，使用同一份包，每次核对安装的 209 个运行及依赖文件与最终构建一致。
29 个无 ID Cell 中，打开前修改的 9 个 Cell 均有可见蓝色标记；继续键入及键盘 Undo 后的
宿主分析状态正确。另一个不等长替换场景在原生 Notebook 与普通文本编辑器并排显示，
扩展和内置 Git 的可见 gutter 均覆盖全部 9 行蓝色，没有新增或删除标记。
测试的开发扩展只有空测试壳，产品来自独立 extensions 目录中的实际安装 VSIX。

打包的普通沙箱尝试在编译后误报入口缺失，获准重试同一命令后成功，失败日志保留。
没有重跑含 commit 的旧 fixture 或无变化的算法套件。测试只从现有 HEAD 创建临时 clone，
在副本暂存并编辑，使用自有 profile、Xvfb 和端口；临时 clone 与 profile 已由驱动释放。
源码和运行身份、四次截图、日志、计时及 W49 文件清单位于
`output/batch-WE-notebook-git-20261029/`。W49 清单同时列出目录迁移的新增和删除文件，
排除环境、原始证据及 VSIX，不暂存或提交任何文件。A1 历史 blocked 和旧验收不改写。
真实 SSH／WSL、其他 OS、远端 CI、发布与未来推送仍未验证，不以本地结果代替。

## 2026-10-29 当前资料采用状态

用户已确认 0.1.6 上传，当前本地候选为 0.1.7，尚未发布。本轮未下载 Marketplace 包核对身份，
下文各次验收仍保留当时的包摘要和未发布记录，不将同版本号视为同一产物。

本次只复评资料并更新本节。关键原文按既有固定提交核对，未运行上游程序或产品测试。
仓库外回执为经理批次 `2026-10-29-corpus-reassessment/notebook-git-receipt.json`，
其中记录阅读范围、原文链接、源码摘要及条件。以下状态供当前采用判断使用。
六项已有经理验收的闭环移至[完成归档](verification-history.md)，原入口保留。其他旧版本
记录仍按原证据级别保留，不将部分完成或历史 blocked 整项归为完成。

| 机制或建议 | 当前状态与依据 |
| --- | --- |
| nbdime 分层 Cell 匹配 | 已有覆盖。[Cell 对齐](../src/notebook/alignment.ts) 已分开 ID、session、精确内容、顺序锚点及有界相似度，近期补了保留源码行的证据。nbdime 有只看类型和源码的匹配层，不能因它也支持 outputs 就判定整套方法不适用。其输出辅助匹配仍不采用。 |
| Jupytext 格式归一化与位置回退 | 具体规则继续不采用。归一化仅作候选线索，并不必然隐藏最终差异，但移除标点、引号及空白或按位置回退不能证明 Cell 身份。[行差分](../src/notebook/lineDiff.ts) 仍保留真实空白变化。没有新的失败输入支持增加这类规则。 |
| 上一个／下一个变更 Cell | 已实现，F5 与 P1 的既有安装态证据覆盖确定变更、当前基准、循环与无变更状态，不重复列为待开发。 |
| 长行及长变更上下文 | 已有字词定位和局部上下文预览，见[详情渲染](../src/ui/details.ts)。这不等于已实现任意长块的展开／折叠，不把该旧候选整体勾成完成。 |
| 已删除 Cell 的只读预览 | 可试但未实施。nbdime 从基准构建删除 Cell 模型的机制可借鉴，当前也有确定删除索引。暂缓原因是尚无新的查看需求，不是理论上不能做。模糊对应不能列为确定删除。 |
| 原生 Git 内嵌差分窗口 | 当前稳定公共 API 路线下不适用。已有只读快照及原生 hover，不依赖内部 QuickDiffWidget 的 Workbench／Monaco 服务，也不注入 DOM。算法分类与界面样式可以分别借鉴，不能据此宣称可调用原生内嵌窗口。 |
| Faah 的资源释放方式 | 已有覆盖。Controller 关闭会使任务失效、清理计时器和订阅，Renderer 释放装饰类型。没有新的残留复现，不新增一层生命周期框架。 |
| Dataform Tools 的场景命名与短 profile 路径 | 部分已有覆盖，统一维护入口仍是条件候选。该项目仅为 Hub review 条目，非已接入语料；其 panel 配置也不证明安装态 UI。只有整理现有驱动确有维护收益时再定范围，不另建框架。 |

资料复评时保留的无 commit 驱动、最低版定向补证及最终文件集核对，已按上方 0.1.7
记录完成本地交付，待经理验收。P1 双版本安装态结果属于当时固定候选，A1 blocked 保留为历史。
真实 SSH／WSL 和其他 OS 仍待实际环境；不能从资料阅读推断通过。

## 2026-10-29 行级替换块分类修复

复现原有 `return h` 被多条赋值和新的 return 替换时，第一行显示蓝色、其余显示绿色的
问题。旧实现按删除与插入行数配对；现在相邻删除和插入组成一个 modified 块，当前侧
整段标蓝，纯新增和纯删除仍分别标绿、标红。与
[VS Code 1.142.0 原生 Git gutter 的分类](https://github.com/microsoft/vscode/blob/1.142.0/src/vs/workbench/contrib/scm/browser/quickDiffDecorator.ts)
一致，但不承诺不同差分算法在所有输入上划分完全相同的块，也不推断语句的语义对应。
保留末尾换行变化和删除位置锚点，双语 README 与更新日志同步说明。

40 个单元测试、typecheck、lint 和打包通过。新增回归覆盖不等长替换、用户截图形状、
未改 return 对纯新增的锚定及末尾换行变化；原有删除锚点断言保留。既有 UI 场景将新增、
删除分阶段检查，以保留三类标记及点击行为的独立断言；该脚本通过语法和 lint 检查，
没有运行含临时 commit 的旧 UI 夹具。

在隔离 Linux VS Code 1.142.0 中实际安装本次 VSIX，核对 209 个运行及依赖文件与构建
一致。临时 clone 仅编辑、暂存，没有创建 commit。同一源码分别显示于原生 Notebook
和普通文本编辑器，使用相同 index 基准：扩展可见蓝色标记覆盖 9 行，内置 Git 的真实
Quick Diff 也覆盖全部 9 行，没有新增或删除标记。截图、原始 Git diff、安装身份和驱动
位于 `output/fix-replacement-hunks-0.1.6/ui/`，运行退出码为 0。三次测试定位假设失败的
原始证据保留于同级 `failed-*` 目录；它们不是产品验证通过记录。

当前包为 `output/packages/notebook-git-gutter-0.1.6.vsix`，SHA-256：
`e7f933d126499610d694ef4c8cac40379b92f9c0b18c39a59699348906ef8d7d`。
本轮没有重新验证最低版本、Windows、macOS、真实 SSH/WSL 或用户原始 Notebook，
也未提交、推送或发布。

## 2026-10-29 匹配修复复核与文档修订

复核本次新增的源码行匹配、预算失效及重复候选处理。移除评分时反复创建的 Unicode 字符
数组，分子和分母统一按 UTF-16 长度计权。单次合成测量中，两个大 Cell、约 183 万合计
字符的匹配从约 36 ms 降到 12 ms；12 个 Cell、约 1100 万合计字符从约 146 ms 降到
53 ms，后者仍明确显示计算超限。这只是本机样本，不是产品延迟或跨设备保证。

39 个单元测试、typecheck 和 lint 通过，已有重复 Cell、未知竞争者和旧任务失效断言保留。
最终包在隔离 VS Code 1.142.0 中安装后，209 个运行文件与构建一致，9 个预先修改的合成
Cell 均显示标记，继续输入及键盘 Undo 通过。结果在 `output/fix-missing-cells-0.1.6/review/`。
双语 README 补充匹配不确定的含义和 SSH/WSL 扩展宿主版本排查，并修正将同时移动和修改
一概说成未完成分析的表述。未重跑已知会创建临时 commit 的旧测试夹具。

该次 0.1.6 包现备份于 `output/fix-replacement-hunks-0.1.6/before/previous.vsix`，SHA-256：
`898b7917ad9615a474838b195df3762650b9be354b176d9f03bf17bb09ecb10e`。
本轮仍未验证用户原始 Notebook、Windows、macOS 或真实 SSH/WSL，也未发布此包。

## 2026-10-29 打开前已修改的 Cell 漏标记修复

用户诊断显示 29 个 Cell 中有 9 个处于匹配不确定状态，现场继续输入也无法恢复对应关系。
合成复现确认：两个相邻多行 Cell 各改一个字符，交叉比较不相关 Cell 时的字符差分超时会
使整个残差区间不接受配对；较长源码还会触发 8000 字符的相似度比较上限。

现在先用保留的完整非空源码行计算有界区间内的内容相似度，要求至少两条不同的共同源码行、
足够覆盖率和相对于全部竞争者的优势，再回退到字符比较。没有按 Cell 序号强行对应，重复
内容和未完成竞争检查继续保持不确定。源码行的缩进和空白仍精确比较，实际行差分不变。

两个新回归在旧代码上失败；修复后 39 个单元测试、typecheck 和 lint 通过。安装修复后的
0.1.6 VSIX，在 Linux VS Code 1.142.0 隔离 profile 中打开无 Cell ID、预先修改 9 个 Cell
的合成 Notebook。使用真实 index 基准，9 个 Cell 的蓝色标记均可见，继续键入及键盘 Undo
通过。安装的 209 个运行及依赖文件与构建一致，截图和驱动位于
`output/fix-missing-cells-0.1.6/`。没有读取用户课程 Notebook，未验证其原始文件或真实 SSH。

该次 0.1.6 修复包现备份于 `output/fix-missing-cells-0.1.6/before/review-input.vsix`，
SHA-256 为 `65b0606559b805ca38f3bb04746a458a32e16d13251c35dad920a1715d37538f`。
之前的 0.1.6 本地包保留在本轮证据目录的 `before/` 中，不能将旧包的 UI 结果视为本次修复验证。

## 2026-10-28 0.1.6 本地打包验证

扩展 manifest 和 npm 锁文件统一为 0.1.6，更新日志补充已实现的变更 Cell 导航。最低
VS Code 版本保持 1.130.0。旧评审中的 0.1.3 明确标为评审时的版本，历史证据和旧包保留。

`npm run typecheck`、`npm run lint`、37 个单元测试及 `npm run package` 通过。生成的
`output/packages/notebook-git-gutter-0.1.6.vsix` 为 594355 字节，SHA-256 为
`338243be2a58e612dce6e36f7999663ffab006d565eb7434142e3ea7dd9bd80e`；包内 manifest、
更新日志和运行时依赖已核对。

在隔离 profile 中分别用 VS Code 1.130.0 和 1.143.1 安装此包，各核对 209 个安装文件与
当前构建一致。两次真实 Notebook UI 测试均通过编辑、暂存、HEAD/index 切换、键盘 Undo、
标记清除、变更 Cell 导航及无变更提示。截图和日志位于 `output/verify-0.1.6/`。测试使用
临时 clone 并仅在其中暂存，没有创建 commit。没有重跑会创建临时提交的旧集成和宿主夹具；
未运行远端 CI 或验证 Windows、macOS、真实 SSH／WSL，也没有发布此包。

## 2026-10-28 当前候选安装态 UI 双版本验证

该次已按限定范围验收，原记录见[完成归档](verification-history.md#2026-10-28-当前候选安装态-ui-双版本验证)。
日期、包身份、平台限制和执行偏差保留在归档，不表示当前包已重新通过同一场景。

## 2026-10-28 工作流并发整理

本地 `Validate extension` 工作流增加并发分组：同一 PR 的后续运行取消过期运行，
同一 push 分支同样如此；PR 与 push 使用不同分组，手动触发按运行 ID 独立。保留所有
触发事件、检查名、两个 VS Code 版本、锁文件 npm 缓存、打包与测试步骤，以及三类
artifact 的 14 天保留期。没有路径过滤；推送与 PR 的同一提交仍可能各运行一次，避免在
门禁合同不明确时跳过检查。管理侧本月快照只记录本仓库一次 push，不能据此估计节省量。

`codex-actionlint` 在默认沙箱因网络命名空间初始化失败而返回 incomplete；获准后使用
同一隔离检查器重试通过。前后字节对照确认除并发配置外，工作流内容不变；本地合成事件
分组检查通过，不代表 GitHub 实际调度。旧运行态夹具含临时仓库 commit，本轮未执行。
没有运行、启用或触发 Actions，也没有提交、推送或发布。

现有矩阵的 `test:vsix` 安装打包产物并运行宿主测试；`test:ui` 运行真实窗口测试，但使用
工作树开发扩展，并非已安装 VSIX 的 UI 测试。此前独立安装态视觉证据记录在下文；F5 的
当前候选只在 Linux VS Code 1.143.1 验证，不能等同于该候选在最低版与 stable 的安装态
UI 矩阵。需要无 commit 的隔离夹具后才能补齐该矩阵，本轮不伪称已验证。

## 2026-10-28 变更 Cell 导航

该次已按限定范围验收，原记录见[完成归档](verification-history.md#2026-10-28-变更-cell-导航)。
日期、包身份、平台限制和执行偏差保留在归档，不表示当前包已重新通过同一场景。

## 2026-10-28 旧 Notebook 的 Cell 身份

该次已按限定范围验收，原记录见[完成归档](verification-history.md#2026-10-28-旧-notebook-的-cell-身份)。
日期、包身份、平台限制和执行偏差保留在归档，不表示当前包已重新通过同一场景。

## 2026-10-28 不同基准下撤销 Cell 移动

该次已按限定范围验收，原记录见[完成归档](verification-history.md#2026-10-28-不同基准下撤销-cell-移动)。
日期、包身份、平台限制和执行偏差保留在归档，不表示当前包已重新通过同一场景。

## 2026-10-28 安装包中的 Cell 移动与编辑

该次已按限定范围验收，原记录见[完成归档](verification-history.md#2026-10-28-安装包中的-cell-移动与编辑)。
日期、包身份、平台限制和执行偏差保留在归档，不表示当前包已重新通过同一场景。

## 2026-10-27 实际安装包的连续编辑闭环

该次已按限定范围验收，原记录见[完成归档](verification-history.md#2026-10-27-实际安装包的连续编辑闭环)。
日期、包身份、平台限制和执行偏差保留在归档，不表示当前包已重新通过同一场景。

## 2026-10-25 0.1.5 发布前复核

已重新核对 12 个产品模块、manifest／锁文件、构建与打包入口、工作流、两份 README
及上轮验收记录。无本轮指定论文。56 个来源文件与上轮安装记录逐项一致，现有 VSIX
仍为 593,163 bytes，SHA-256 为 `faab9393cc457ecd9958b8927715b176b7a6f4d19921f4574974ab65502a5669`。
未发现需要修改产品源码的明确缺陷；保留既有脏工作树，不重新打包相同内容。

| 工作项 | 当前状态 |
| --- | --- |
| 源码与版本身份 | 已验证。当前来源文件、0.1.5 版本、最低 API 与既有包一致。 |
| 集中检查 | 已验证。typecheck、lint、53 项核心／Git 测试、分析性能及 actionlint 工作流静态检查通过。 |
| 实际安装与视觉 | 已验证。1.143.1 同包实际安装通过 14 项宿主检查；1.130.0 完整原生 UI 通过 52 个检查点，人工查看中文／emoji 预览及高对比删除标记截图。 |
| 收尾 | 已验证。73 个包内产品运行时／媒体文件与当前构建一致，51 个本地链接与标题锚点通过；已清理本轮 UI 通信文件。 |

本轮证据目录为忽略目录 `output/final-review-0.1.5-20261025/`；不提交、推送或发布。
实际安装逐项核对 138 个运行时／依赖文件、依赖版本及 56 个来源文件。测试后再次
确认来源和 VSIX 哈希不变。源码读取、Cell 对齐、异步版本失效、装饰释放、只读 Git
边界与源码预览转义未发现新的明确缺陷；本轮只更新本记录，没有修改产品或依赖。

性能样本为 Linux x64、Node 24.22.1、Xeon Gold 6240R：300 Cell × 40 行冷分析
5.43 ms，单 Cell 编辑 3.43 ms，30 次连续编辑 0.74–5.58 ms、均值 1.23 ms，开头
插入 Cell 1.80 ms，5000 行 Cell 编辑 3.00 ms；热编辑和插入均只重算 1 个 Cell。
只统计 Analyzer 耗时，不含 Git、界面绘制和配置的 200 ms 防抖；原始样本在本轮 checks。

首次 actionlint 受沙箱 NETLINK 限制未完成，同一只读隔离 wrapper 经执行提权后通过，
两份回执均保留。本轮没有新的远端 CI；CI 固定 Node 24.18.0，与本机版本分别记录。
上轮 1.143.1 的完整 UI 和 1.130.0 的安装证据因来源及包身份一致继续有效，不冒充
本轮新执行。最低版原生 Quick Diff 对照实际为普通文件请求 3 次、Cell 请求 0 次，
原生 hover 与 gutter 的公开 API 限制不变。Windows、macOS、真实 SSH／WSL 的视觉
验收仍未执行。本轮截图、日志和包校验结果已保留，现有 0.1.5 VSIX 继续作为本地候选。

## 2026-10-23 重构与文档复核

本轮是 0.1.5 本地候选的行为保持重构，不修改版本、公开命令或配置，不提交、推送或
发布。已核对当前仓库规则、状态呈现、行数预算、测试启动器与 UI 驱动、manifest／
lockfile、CI、两份 README、验收和评审记录、许可。无指定论文。原工作树、57 个项目
文件和原 VSIX 已备份在忽略目录 `output/refactor-docs-0.1.5/before/`。

| 工作项 | 当前状态 |
| --- | --- |
| 状态呈现 | 已验证。用明确的状态分支替代嵌套三元表达式，统一组装 tooltip；Cell 汇总只读取一次当前配置。112 组重构前后输出完全一致。 |
| 共用定义与诊断 | 已验证。源码预检与行差分共用行数上限；测试启动器共用文件哈希计算；UI 复用鼠标命中诊断，修正场景块和错误处理缩进。 |
| README 与开发文档 | 已验证。保持英文默认和中文对应，补充源码／市场版本区别；当前构建发布指南前移，历史原文折叠保留，移除固定旧版发布命令。 |
| 集中验证和新包 | 已验证。typecheck、lint、53 项核心／Git 测试、两版各 14 项实际安装宿主检查及稳定版 52 个 UI 检查点通过；包、链接和双语说明已核对。 |

本轮证据位于忽略目录 `output/refactor-docs-0.1.5/`。112 组输出比较覆盖 HEAD/index、
启用／禁用、等待／完成、错误／超限／基准缺失等状态，比较文本、图标、tooltip、无障碍
标签和显隐；它是使用最小 VS Code 配置夹具的逻辑证据，不代替真实宿主或 UI 验证。

在 Linux x64、Node 24.22.1、Git 2.43.0 下，同一份 VSIX 分别在 VS Code 1.130.0 与
1.143.1 实际安装，各通过 14 项宿主检查。每次核对 138 个已安装运行时／依赖文件和
56 个工作树来源文件（本记录除外）。1.143.1 另对当前构建运行完整原生 UI 回归，
52 个检查点通过；人工查看本轮中文与 emoji 预览、高对比及删除位置截图。UI 使用
隔离开发宿主，产品运行时与已安装包逐字节一致。未重跑最低版完整 UI，未执行新的
Windows、macOS、Remote SSH／WSL 视觉验收或远端 CI，也未重复无关性能基准。

51 个本地链接与标题锚点通过，配置默认值、四个命令名称和最低版本与两份 README
一致。英文 Harper 的 27 条提示经人工核对，保留 VSIX、JGM、MiB、产品名、配置名、
英式拼写和现有句式标题；不将有提示的检查称为零告警。中文完成表达与术语复核。
发布步骤同时核对官方文档源码和本地 `vsce publish --help`，没有执行上传操作。
历史记录正文与重构前备份一致。

最终包为 `output/packages/notebook-git-gutter-0.1.5.vsix`，593,163 bytes、219 个 ZIP
条目，SHA-256 为 `faab9393cc457ecd9958b8927715b176b7a6f4d19921f4574974ab65502a5669`。
包中 73 个产品运行时／媒体文件与当前构建逐字节相同；两份 README 和许可齐全，
测试、构建脚本、字体和内部验收记录未进入包。版本、依赖、工作流与公开功能不变。
本轮只修改 8 个已有项目文件，没有新增项目文件；保留原工作树和备份，已清除本轮
UI 通信文件，保留日志、截图、源码指纹及旧包供复查。未提交、推送或发布。

## 构建与调试

使用 Node.js 24.22.2（24.x LTS）和 npm，在仓库根目录运行以下命令。依赖版本由 `package-lock.json` 锁定，首次安装使用 `npm ci --ignore-scripts`。

```sh
npm run typecheck
npm run lint
npm test
```

`npm test` 编译一次，运行核心算法和真实 Git 集成测试，不需要 GUI。构建会先清理 `out/`，避免已删除测试的编译产物继续残留，并从共享图标定义生成 SVG。其他检查按需要运行：

| 命令 | 用途 |
| --- | --- |
| `npm run test:integration` | 单独排查 Git 集成问题，已包含在 `npm test` 中 |
| `npm run test:host` | 真实宿主检查，覆盖源码预览、缓存、Git 事件、资源释放和多仓库 |
| `npm run test:ui` | 原生 Notebook 的行级标记、Undo、Cell 插入、滚动、分屏及主题验收 |
| `npm run benchmark` | 测量大型 Notebook 和连续编辑的分析耗时 |
| `npm run package` | 在 `output/packages/` 生成本地 VSIX |
| `npm run test:vsix` | 对实际安装包运行同一宿主套件 |

打包同时生成 `.vsix.sha256` 校验文件。安装检查会验证存在的校验文件，再逐文件核对
实际安装的运行时、媒体及 diff 代码与当前构建。测试期间源码或 VSIX 变化时不生成
成功记录；新一次运行先清除旧结果，避免误读上次成功。CI 在质量检查通过后只打包一次，
最低版与稳定版下载同一个 VSIX 和校验文件，显式传给宿主与 UI 入口进行安装验证。
默认 `npm run test:ui` 仍使用开发扩展，只有 `run.cjs ui <vsix-path>` 才是安装态 UI。
当前完整本地 UI 的通过与未完成范围见上方 2026-11-01 记录。

宿主、UI 和 VSIX 检查共用 `scripts/testing/run.cjs` 与隔离运行时工具。测试按算法、Git 和原生宿主分组，Git 夹具统一放在 `tests/gitFixture.ts`，原独立渲染探针已由完整安装态 UI 覆盖并退役。

Linux UI 截图还需覆盖中文和 emoji 的字体；Ubuntu 可使用 `fonts-noto-cjk` 与
`fonts-noto-color-emoji`。启动器会检查所需字形是否有可用字体；也可通过标准
`FONTCONFIG_FILE` 指向隔离的测试字体配置。此要求只针对截图验证，不会把字体或本机
字体配置打包进扩展，也不会自动修改使用者的字体设置。
现行入口统一执行完整 UI 套件，原预览专用模式已退役。

F5 选择 `Jupyter Notebook Git Marks` 调试产品；装饰验证使用上方完整安装态 UI 入口。演示文件为 `demo/demo.ipynb`。宿主和 UI 测试自动创建临时 Git 仓库及独立 VS Code 用户目录，不修改日常配置。Linux 无显示环境需要 Xvfb，Openbox 用于提供窗口焦点。首次运行默认下载 manifest 声明的最低 VS Code 版本，当前为 1.130.0。可通过 `VSCODE_VERSION=stable` 检查当前稳定版，或用 `VSCODE_EXECUTABLE` 指定已有的可执行文件。缓存版本不匹配时不会直接复用。

UI 测试通过真实键盘输入修改源码，调用 VS Code 原生 Undo 和 Notebook reveal 命令进行撤销与滚动，使用测试专用 kernel 产生输出。真实截图和渲染节点检查保存在 `output/playwright/product/`，性能测量在 `output/performance.json`。这些测试工具和产物不进入 VSIX。



## 发布到 Marketplace

本项目的 publisher 为 `StevenYang0316-5274`，扩展名为 `notebook-git-gutter`。在 [Marketplace 管理页](https://marketplace.visualstudio.com/manage) 登录拥有该 publisher 发布权限的 Microsoft 账户。

已发布版本需要更新时，先执行 `npm version patch --no-git-tag-version`；尚未发布的本地候选无需仅因重构而再次升版。然后运行 `npm run package` 和 `npm run test:vsix`，在管理页打开现有的 `notebook-git-gutter` 条目，上传通过检查的 VSIX。只有首次创建扩展时才使用 `New extension → Visual Studio Code`。包名自动采用 manifest 的名称和版本。

命令行发布已有包可使用 `npx --no-install vsce publish --packagePath ./output/packages/notebook-git-gutter-VERSION.vsix`，执行前将 VERSION 替换为已验证包的实际版本，认证方式见 [官方发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。这条命令会上传到市场，本项目的构建和测试脚本不会执行发布。`package.json` 已填写公开源码仓库，打包时会把文档的相对链接改写为该仓库 `main` 分支的链接。

## 历史验收记录

以下保留各次验收当时的版本、文件名、API 范围及包校验和，不代表当前工作树已通过
相同检查。同一版本号可能对应多份未发布的本地候选，应以本页最新记录的包哈希为准。

<details>
<summary>展开历史验收、诊断过程与评审依据</summary>

## 2026-10-23 持续改进：0.1.5

当前目标为通过不同方法提高项目质量。上一轮已完成 0.1.4 的实际修复和验证，属于进展。
本轮重新核对工作树与 0.1.4 验收哈希，56 个被记录文件一致；保留既有未提交工作。
阅读当前产品、Git 测试、宿主、打包与 CI、两份 README 和已有评审，无指定论文。
版本选择 0.1.5，维持现有产品范围和最低 VS Code 1.130.0；不 commit、push 或发布。

| 工作项 | 当前状态与验证入口 |
| --- | --- |
| 可靠重命名的基准路径 | 已验证。HEAD 只采信属于同一提交的旧路径提示；index 保持当前暂存路径。Reader 回归覆盖目的路径已存在、失效旧路径；真实宿主在 Git API 保持旧提交时仍正确比较实际 HEAD，不把重新使用的旧路径当基准。 |
| index 读取成本与一致性 | 已验证。一次 ls-files 的 stage/debug 输出同时读取 stage、OID 与 intent-to-add，保留冲突和未知格式的明确错误。五轮交替测量共每版 100 次热读取，旧版 300 条 Git 调用，新版 100 条；源码和 blob 缓存身份一致。 |
| 安装产物对应源码 | 已验证。同一最终包在两版各通过 14 组宿主检查，逐文件核对 138 个运行时／媒体／diff 文件及依赖版本。错误校验和、人为陈旧运行时、真实首轮同版本旧包均被拒绝；失败不保留上次成功记录。 |
| CI 单包多版本验收 | 已实现，actionlint 静态检查通过；未运行新的远端 CI。质量检查和打包只做一次，多版本按产物 ID 下载同一 VSIX／SHA 文件执行安装宿主与 UI，不再重复算法套件。产物名包含 SHA 和 run attempt，重跑不会同名覆盖；download-artifact v4.3.0 已核对官方来源并固定完整 SHA。 |
| 版本、文档与集中验证 | 已验证。0.1.5 manifest／锁文件、CHANGELOG 与双语说明一致。类型、lint、53 项核心／Git、性能、工作流静态检查通过；1.130.0 与官方当前稳定版 1.143.1 各通过 52 个完整 UI 检查点。真实截图已人工查看。 |

证据放在忽略目录 `output/improve-0.1.5/`。未测量的 hover 缓存暂不引入；本轮性能
假设集中于可直接计数的 index 子进程重复查询。真实 Windows／macOS／SSH／WSL
视觉验收仍是已有范围限制，不将本地 Linux 结果扩大为其他平台结果。

官方依据：[Git ls-files](https://git-scm.com/docs/git-ls-files) 的 --stage / --debug 与 NUL
输出约定、[固定版 Git 实现](https://github.com/git/git/blob/v2.53.0/builtin/ls-files.c)、
[VS Code Git Change 接口](https://github.com/microsoft/vscode/blob/1.130.0/extensions/git/src/api/git.d.ts)、
[download-artifact v4.3.0](https://github.com/actions/download-artifact/commit/d3f86a106a0bac45b974a628896c90dbdf5c8093)。
--debug 官方明确不保证格式稳定；只识别有界已知 flags，遇到未知格式继续报错，不将其
解释为空基准。没有新增运行时依赖、服务、遥测或写 Git 能力。

首轮 53 项常规测试、最低版 14 组安装宿主检查及两项无效包拒绝已通过。后续状态机
复核追加一项约束：只有 Git API 报告的提交与实际 HEAD 相同时才使用其旧路径提示。
新增真实宿主回归在独立仓库关闭自动刷新，提交 rename 并重用旧路径，要求 API 保持
旧提交的同时仍正确比较新 HEAD；合并冲突测试也加强为分别核对 HEAD/index 错误码。
这些追加实现已通过后续集中复核。首轮包与日志保留在本轮证据目录，不将首轮结果当
最终包结果。早期测试夹具留有旧路径的脏标签页，后续保存产生 File Modified Since
提示；已在移动文件前丢弃该夹具的未保存修改，最终宿主日志没有该错误。

### 最终证据与范围

最终包为 `output/packages/notebook-git-gutter-0.1.5.vsix`，592,947 bytes、219 个 ZIP
条目，SHA-256 为 `b7d0e6c8da740b1fb152dfee0d3d7c3ca4b4f43facb617ab66cada866d8e0e7d`，
另有同目录 `.vsix.sha256`。两版安装的包哈希相同；最终记录核对 56 个来源文件的
哈希与当前工作树一致（本进展记录除外）。最低版宿主之后仅调整了两份 UI 工具，
138 个包内运行时／依赖文件及宿主用例保持相同；两版 UI 均用最终就绪条件完成。

性能测量使用 Linux x64、Node 24.22.1、Git 2.43.0、Xeon Gold 6240R、231,614-byte
Notebook（300 Cell × 40 行）。五轮各 20 次热读取、每次交替先后顺序，旧版中位
7.58 ms / p95 10.67 ms，新版 2.61 ms / p95 4.01 ms；冷读取调用数 5 → 3，
热读取 3 → 1。仅统计 Git 读取，不包含 UI 或 200 ms 防抖。分析基准冷启动 5.64 ms，
单 Cell 编辑 3.94 ms，30 次快速编辑 0.73–4.54 ms，开头插入 1.73 ms，5000 行
Cell 修改 3.81 ms；重算数与预算断言通过。原始数据和方法分别在本轮 checks 中。

完整 UI 包括未保存输入、Undo、Cell 插入、输出变化、滚动、双侧分屏、空 Cell／
末尾删除、四主题、字词与长行、中文和 emoji、源码转义。1.143.1 首次在分屏中文
悬停时超时；原交互加诊断后未重现，随后增加源编辑器焦点就绪条件，两版各 52 个
完整检查点通过。不将一次重跑成功当成已确定根因；最初失败的日志与截图仍保留，
今后的失败会同时记录公开 HoverProvider 返回数量、鼠标命中及焦点，且不掩盖原错误。

本轮也重查了 [1.143.1 QuickDiff 模型源码](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/workbench/contrib/scm/browser/quickDiffModel.ts)：
仍要求 textFileService.files 的已解析模型；两版真实探针均为普通文件请求 2 次、Cell
请求 0 次。继续使用公开 Cell TextEditor 装饰与原生 hover，不声明开放了内嵌 Git Widget。

45 个既有本地链接和标题锚点通过。英文 Harper 剩余 VSIX 缩写告警已人工确认，中文
完成表达和术语复核。当前 Marketplace 页面只读核对为 0.1.4，0.1.5 为本地候选，未
自动提交、推送或发布。CI 保留已有 Node 24.18.0 固定版本；本机启动器为 24.22.1，
不能把本地验证称作该 Node 版本的远端 runner 验证。Windows、macOS、真实 SSH／WSL
的视觉验收仍未执行。

已清理错误包夹具、临时语法检查输入、UI 通信文件和当前输出中残留的旧模式／失败
副本；原始证据已保留或归档，VS Code 缓存与隔离字体组件继续用于复现。没有新增项目
文件、运行时依赖或用户命令；本轮改动集中在既有 16 个文件及本进展记录。

## 2026-10-22 0.1.4 版本与代码复核

已阅读当前仓库规则、12 个产品 TypeScript 文件、相关测试与构建入口、工作流、两份
README、CHANGELOG 及先前视觉验收记录。没有本轮指定论文。保留既有未提交修改，
默认不提交、推送或发布；本节复用现有进展记录。

| 工作项 | 当前状态 |
| --- | --- |
| 版本与发布记录 | 已验证。manifest 与 lockfile 的项目版本同步为 0.1.4；将已实现功能归入 0.1.4 CHANGELOG。最低 VS Code 仍为 1.130.0，依赖与 API 快照不变。 |
| 源码复核 | 已完成静态复核。检查 Cell 匹配证据、generation 与文档版本、缓存失效、Git 只读边界及源码 HTML 转义，未发现需要改写这些实现的确定问题。 |
| 多行修改预览 | 已验证。原有共享 400 行额度会让原文先占满、完全挤掉当前内容。替换改为两侧各 200 行，纯新增／删除仍为 400 行；双语限制说明同步更新。真实 TextDocument 断言覆盖两侧额度、截断提示与源码不变。 |
| 回归与安装包 | 已验证。typecheck、lint、52 项核心／Git 测试通过；同一份 0.1.4 VSIX 在 1.130.0 与 1.142.0 各通过 14 组隔离安装宿主检查。1.142.0 另通过 14 个真实 UI 检查点，人工查看中英文与高对比截图。 |

本轮证据写入忽略目录 `output/review-0.1.4/`。此前 0.1.3 的真实 UI 截图仍为历史证据，
不将它称为本轮 0.1.4 包的安装或视觉验证。

本轮最终包为 `output/packages/notebook-git-gutter-0.1.4.vsix`，592,182 bytes、219 个 ZIP
条目，SHA-256 为 `5e28c07983d275618bf5c72f96d1a225190e347f55c6c5539b5f54af4cd07fb5`。
两个版本安装的包哈希相同；73 个运行时／媒体文件与工作树逐字节相同，没有测试、字体
或诊断文件进入包。56 个可维护文件的哈希与验收源码一致，另有本记录持续更新。

新增断言首次将 MarkdownString.appendText 的空格编码 `&nbsp;` 当普通空格，宿主检查
因此失败；已按既有断言方式规范化后复查，保留截断提示、行数和源码不变要求。
首次受限环境打包未能枚举入口；同一打包命令在获准的本地环境成功，原日志均保留。
45 个既有本地链接与标题锚点通过，新增英文的 Harper 仅提示 UTF，人工确认是技术缩写。
工作流源码哈希未变，复用前轮 actionlint 结果；本轮未重跑无关性能基准。

本轮为 Linux x64、Node 24.18.0 的本地验证。密集多行额度在真实 TextDocument 上验证，
截图覆盖长行、多处字词、中英文、四主题及恶意源码转义；未新增密集多行截图验收。
没有新的远端 CI、Windows、macOS 或真实 Remote SSH / WSL 视觉验证。已清理本轮瞬时
通信与语法检查输入文件，保留可复查证据和隔离字体组件；未 commit、push 或发布。

## 2026-10-22 预览视觉复核

用户指出长行截图有乱码、混用语言及差异不明显，要求 VS Code Git 的原生效果。
已重新查看实际截图：测试样本混有英文、中文与 emoji；中文来自夹具，扩展没有翻译。
本机字体查询显示没有覆盖 U+1F468 / U+1F469 的字体，emoji 显示为方框；此前 DOM 文本
一致性检查不能替代字形可见性，撤回该截图足以证明 Unicode 视觉效果正确的结论。
已阅读当前相关源码、启动器、测试、两份 README 和规则，继续核对固定版官方实现；无指定论文。

| 工作项 | 当前状态 |
| --- | --- |
| 字符与字体边界定位 | 已验证。方框来自缺少 emoji 字体；实际绘制记录确认 Noto Color Emoji 与 Noto Sans CJK 参与字形渲染。字体仅在忽略的 `.tmp/ui-fonts/`，通过隔离 FONTCONFIG_FILE 使用，不修改系统、用户配置或 VSIX。 |
| 原生 Git 组件复用 | 已核实固定版源码：QuickDiffModelService 只从 textFileService.files 获取已解析模型；Git 小窗依赖内部 EmbeddedDiffEditorWidget。用户明确选择 Cell 内红绿底色与逐词对照，采用公开 MarkdownString 的受限 span 和原生 diff 主题变量；不调用内部组件。 |
| 样本、视觉断言与截图 | 已验证。去掉删除线与顶部标题，相邻红色 `-` / 绿色 `+` 等宽行使用原生 diff 配色，字词背景加深。英文、中文分别保持原文；两版各 14 个预览截图检查点覆盖四主题、实际字体、恶意源码和无可执行链接。已人工查看实际截图。 |
| 集中验证与收尾 | 已验证。typecheck、lint、52 项常规／Git 测试、工作流静态检查通过，隔离安装宿主各 14 组通过。最终包及最低版已验收包仅 CHANGELOG 不同，全部运行时代码与媒体逐字节一致。诊断探针、瞬时文件与无效截图移出测试输出，证据分类保留；未提交、推送或发布。 |

本轮证据位于忽略目录 `output/preview-review-20261022/`；先前未提交修改完整保留。

最终包为 `output/packages/notebook-git-gutter-0.1.3.vsix`，592,011 bytes、219 个 ZIP 条目，
SHA-256 为 `b8f04229bf2bb38446ee5ef7eccc798a7796f6a944ac9023459600d202fbb3eb`。
1.142.0 实际安装该包通过全部 14 组宿主验收。1.130.0 安装通过的包为
`8c95c521f457f2c0327a088214cccc998b4669ae2f8bcb415622d6a540f39acb`，与最终包仅
`extension/changelog.md` 不同；73 个编译／媒体文件全部相同，没有为文案修正重复运行
整套最低版宿主测试。两版真实 UI 预览均使用同一最终渲染实现，各通过 14 个检查点。
本轮验证在 Linux x64、Node 24.18.0 的隔离桌面和临时 Git 仓库完成，未运行新的远端 CI，
不代表 Windows、macOS 或真实 Remote SSH / WSL 客户端的视觉验收。

actionlint 静态检查 1 份工作流通过；新增英文段落的 Harper 仅提示已人工确认的状态缩写
JGM，中文已完成表达和术语复核。字体与测试／诊断文件均未进入 VSIX；新版 README 的
详情图片是原生 Notebook 的实际截图。字体包下载文件已删除，隔离测试字体组件保留以便复现。

安全边界随展示方式更新：MarkdownString.supportHtml 开启以使用公开支持的固定标签；
isTrusted 仍为 false。所有 Git 和内存源码的 `& < > " '` 均先转义，源文本不能生成 HTML
节点、图片或链接。只输出固定 pre/code/span/b 标签，style 仅引用原生 diffEditor 的行／词
背景变量；没有 Workbench DOM/CSS 注入或新的网络内容。高对比主题的词背景透明时，用
原生 diff 词边框色作为文字色，同时保留 `-` / `+` 与词加粗；不依赖单一颜色或粗体。
仓库 UI 启动器在缺少 CJK/emoji 字体时明确报错，不再把缺字截图当通过。

首次新样式 UI 已确认实际使用 Noto Color Emoji，英文长行不再出现方框；切换中文夹具时，
原有 WorkspaceEdit 批量替换再次触发最小版本的源文本损坏，被逐字一致性断言捕获。
已将整套新夹具的基准准备、编辑及恢复统一改为真实 Cell TextEditor.edit，不放宽断言。
同时移除短预览顶部的基准标题，直接显示红绿行，避免标题靠近 Notebook 工具栏被遮挡；
基准仍由已有 JGM 状态项和诊断标明。原始日志与截图保留，待重跑验证。

第二轮完整 UI 已通过英文／中文和实际字体检查，在高对比主题未通过词区分断言。
截图确认该主题默认词背景透明，已增加原生边框颜色的文字适配；断言同时检查词颜色
与粗细，读取实际 b 节点的字体权重，不把外层 span 的默认权重误当词权重。
当时使用 `NGG_UI_PREVIEW_ONLY=1 npm run test:ui` 聚焦这组变化；该专用模式已退役。原夹具、交互和
断言；默认完整 UI 路径保留，没有跳过或降低断言。

1.142.0 的后续检查在截图后失去悬停。临时诊断记录确认截图前 Noto Color Emoji 已参与
绘制，截图后浮层才消失。隔离测试改变 hover.above 的假设没有解决问题；仅保留原始
光标也仍复现。最终改为 CDP Page.captureScreenshot 的现有视图路径（fromSurface=false），
不写 DOM、输入样式或 viewport，不再触发截图时的布局副作用。两版各 14 个预览检查点
均通过，截图实际包含红绿行、字词高亮和完整 Unicode 字形。所有临时布局诊断和设置
探针已移除；相关失败日志保留，不把早先仅 DOM 通过的结果当视觉通过。

参考固定版本官方实现：[QuickDiff 模型](https://github.com/microsoft/vscode/blob/1.142.0/src/vs/workbench/contrib/scm/browser/quickDiffModel.ts)、
[小窗](https://github.com/microsoft/vscode/blob/1.142.0/src/vs/workbench/contrib/scm/browser/quickDiffWidget.ts)、
[受限 Markdown 样式](https://github.com/microsoft/vscode/blob/1.130.0/src/vs/base/browser/markdownRenderer.ts)、
[diff 主题颜色](https://code.visualstudio.com/api/references/theme-color#diff-editor-colors)。

## 2026-10-21 目录与重复资源精简

本轮精简同级文件、归并重复定义并整理职责，随后按追加要求简化详情并增加字符级对照及长行局部上下文，发布版本保持 0.1.3。
已阅读仓库规则、现有实现与导入关系、两份 README、测试启动器、构建配置、工作流和历史
验收记录，无指定论文。以任务开始时的工作树为基准，保留先前所有未提交修改，不提交、
推送或发布。备份、迁移清单与本轮检查证据放在忽略目录 `output/refactor-20261021/`。

| 工作项 | 当前状态 |
| --- | --- |
| 文件盘点与职责划分 | 已验证。根目录原有 20 个文件，其中 4 个是历史 VSIX；media 同级 46 个文件，其中 44 个是组合图标。 |
| 源码与测试工具目录 | 已验证。源码根目录 13 → 2 个文件，产品 TypeScript 共 13 → 12 个；按 Notebook、Git、界面分组，局部配置和异步代次归并，保留 F5 探针与全部既有测试。 |
| 图标与构建 | 已验证。44 个组合 SVG 由共享定义生成，与原资源逐字节一致；media 同级 46 → 2 个文件。版本、类型快照和图标大小检查并入统一构建。 |
| 详情与菜单简化 | 已验证。删除重复前缀，保留 Original / Current / Deleted 和短基准标签；菜单为 Show Change。原生 UI 覆盖两侧分屏、删除位置与无独立 Diff 标签。 |
| 字符级对照及长行上下文 | 已验证。字词修改用删除线／粗体区分；长行按实际偏移提取各处修改附近的 24 个字素上下文，合并相邻片段，省略远处未改内容。覆盖 4000 字符之后的修改、重复词、多处修改、中文、emoji、组合字符及空白。输入合计限 64,000 个 UTF-16 单元，8 处／600 单元修改，Diff 预算 10 ms／200 token，超限明确退回源码。 |
| 文档与包归档 | 已验证。文档和许可按目录归拢，根目录 20 → 10 个文件，可维护项目文件 101 → 57 个；4 个历史 VSIX、旧校验和与安全报告均保留并核对哈希。 |
| 集中验证与清理 | 已验证。typecheck、lint、52 项核心／Git、1.130.0 的 40 个真实 UI 截图检查点、1.130.0 与 1.142.0 各 14 组同包安装验收通过。原始备份与中间证据经哈希校验后压缩归档，移除本轮瞬时文件，未提交、推送或发布。 |

### 当前目录

```text
src/
  extension.ts, controller.ts   入口与生命周期
  notebook/                    规范化、Cell 对齐、行差分与分析
  git/                         仓库基准、只读 Git 与缓存
  ui/                          装饰、悬停与共享图标定义
tests/
  unit/, integration/          算法与真实临时仓库
  vscode/                      原生宿主与实际 UI
scripts/
  build.cjs                    校验、编译、资源生成与本地打包
  testing/                     隔离桌面测试启动器
docs/                          中文 README、验收与评审
LICENSES/                      历史许可与第三方声明
media/                         产品图标、banner 与真实截图
```

`out/` 是可重建输出，包含编译文件和按主题分组的 gutter 图标；不手工维护生成文件。
`output/` 保存本地包与检查证据，`node_modules/`、`.vscode-test/`、`.tmp/` 分别保留依赖、
隔离运行时和已有临时测试数据。这些目录不进入版本控制，也不向 VSIX 混入内部记录。

首次实际打包发现既有 README SVG banner 被 vsce 拒绝。原始设计已完整移至
`docs/assets/readme-banner.svg`，用本机 `rsvg-convert` 渲染为 `media/readme-banner.png`，
双语 README 共用这张 PNG；普通构建无需安装此工具。原始 SVG 不进入 VSIX，未绕过打包校验。

用户追加要求后，简洁悬停的首次 UI 回归在读取测试快照时失败：`ui-live.json` 正被重写，
读取返回 undefined。已保留完整失败日志，将测试端快照统一改为先写临时文件、再原子替换，
避免读取半截 JSON；继续验证，不以重试掩盖该竞争问题。

下一次回归还发现分屏的测试定位使用 elementFromPoint，被浮在 gutter 上方的 Cell 状态
提示遮挡。失败截图与两侧标记坐标已保留，测试改为按编辑器边界定位对应源码，不修改产品
渲染、不降低原有分屏断言。

现场诊断进一步确认，提示浮层不仅影响定位，还会截获模拟点击。临时 HoverProvider 观察
和实际 CDP 鼠标实验表明，浮层消失后再次移动到同一点即可显示正常详情。测试现先退出
菜单提示、等待源码坐标能直接命中编辑器，再执行鼠标交互；不依赖固定延时或增加超时。
临时诊断 Provider 和保留窗口开关已移除，实验结果保存在本轮忽略的证据目录。

追加长行的首次 UI 验证在 emoji 断言失败。独立原生宿主探针确认：1.130.0 在这段长文本上
通过 WorkspaceEdit 批量替换后，实际 Cell 文档把 `👨‍💻` 的高位代理项丢失；同一内容通过
真实 Cell 的 TextEditor.edit 完整保留。测试改用后者模拟未保存编辑，并断言最终文档与
目标文本逐字相同，不通过放宽 Unicode 断言掩盖问题。原始失败、宿主对照结果均保留。

安装包宿主测试的长行检查通过后，后续输出计数检查遇到新夹具 commit 的延迟 Git 状态
事件，多了一次合法分析。已把原有“仅输出不重算”的计数检查放在写 Git 的夹具之前，
保持原断言，并保留失败快照；两类事件分开验证，不增加等待时间或吞掉计数差异。

### 本轮验证与交付

本轮运行环境为 Linux x64、Node 24.18.0，真实 UI 使用 VS Code Desktop 1.130.0。
最终同一个 0.1.3 VSIX 在 1.130.0、1.142.0 各通过 14 组宿主验收，SHA-256 前后不变。
包为 `output/packages/notebook-git-gutter-0.1.3.vsix`，602,046 bytes，219 个 ZIP 条目，
SHA-256 为 `070ff4e043dc32675848ad669c900f9f3e7793f168420e0d11899ad88c02c5de`。
73 个编译文件与媒体文件逐字节匹配；测试、脚本、类型、内部记录和原始 SVG banner 未入包。
包内保留全部必要许可。工作树未提交，源码身份以安装记录中的逐文件哈希为准。

52 项测试全部通过，无跳过；复用现有宿主和 UI 套件补断言，未新建重复的测试文件。
原生 UI 共 40 次截图，包含长行字词局部上下文、Unicode、分屏、Undo、输出、Markdown 和四套主题。
`media/screenshots/change-details.png` 来自本轮真实截图。F5 产品与独立探针的编译入口、
资源路径均核对存在；此次未单独运行 F5 手动探针。类型检查、API 行为、UI 可见性和实际
VSIX 安装分别留证，没有互相替代。

追加需求由 [字词差分与上下文](../src/notebook/lineDiff.ts) 记录偏移并生成片段，
[原生悬停](../src/ui/details.ts) 安全渲染；[核心回归](../tests/unit/core.test.ts) 验证重复词、
重建与字素边界，[宿主验收](../tests/vscode/host.ts) 检查真实文档和包内提供者，
[UI 夹具](../tests/vscode/ui.ts) 与[浏览器断言](../scripts/testing/ui.cjs) 核对真实删除线／粗体。
另外实际运行 1000 组生成样本，全部通过偏移重建和片段原文一致性检查；这些是额外实验，
不计入 52 项常规测试。测试样本与 Git 写操作只发生在独立临时仓库。

分析性能使用 Intel Xeon Gold 6240R、96 个逻辑 CPU 的共享主机：300 × 40 行 Cell 冷分析
5.47 ms，单 Cell 编辑 2.96 ms，30 次连续编辑 0.73–5.44 ms，开头插入 Cell 1.54 ms，
5000 行 Cell 单行修改 3.20 ms。该测量发生于目录重构后，后续字符预览仅在悬停时计算，
未改变 Analyzer 路径，因此未重复运行分析基准。数字不含 Git I/O、UI、悬停或 200 ms 防抖。

长行预览单独测量 changedText + textContexts，使用同一共享主机、Node 24.18.0，
各 30 次，包含首轮；测量期间 UI 套件也在运行。修改前后合计 13,716 个 UTF-16 单元时，
中位 3.02 ms、p95 4.36 ms、范围 2.79–24.38 ms；61,316 单元时，中位 14.32 ms、
p95 16.93 ms、范围 13.73–18.08 ms。两组各有三处少量修改，预览保留合计 100 单元的
局部上下文。该测量不含 Git、VS Code 渲染和端到端悬停延迟，不代表所有输入的性能上界。

actionlint 检查一份工作流通过；agnix 无错误／警告，保留 3 条既有信息建议。45 个本地链接
及锚点有效。英文新增段落离线 Harper 仅提示技术词 UTF，人工保留正确的 UTF-16；中文已按 humanizer-zh 复核，保护源码、
许可原文和双语语义。范围检查结合迁移前工作树、源码正文和哈希人工审查，不把工具退出
0 当成自动批准。既有 LineDiff 与原有核心回归保留；只对追加的详情和测试竞态作行为调整。

本轮证据在 `output/refactor-20261021/`，按检查、桌面验收、日志和归档整理。失败日志与
现场实验保留，临时观察器和调试窗口开关移除。未运行新的远端 CI；未验证 Windows、macOS
或真实 Remote SSH / WSL 界面。Notebook 的 Git 内部逐字背景与内嵌差分仍无公开接口，
字符对照采用原生悬停的安全 Markdown。发布到 Marketplace 需要后续单独操作。

## 2026-10-21 评价与仓库规则修复

本轮按用户要求修正旁观评价、精简仓库规则并补齐 CI 产物信息。已阅读评价、AGENTS、当前
workflow 和相关官方说明，没有指定论文。范围仅为这三份文件与本验收记录，原有产品代码、
测试、README 和截图改动保留，不提交、推送或重新打包。

| 工作项 | 当前状态 |
| --- | --- |
| 评价事实与后续进展 | 已验证。移除主要环境为 WSL 的假设，静态截图不称动图，区分原评审与后续实现，不把缺 ID 一概视为无法分析。 |
| 项目规则 | 已验证。AGENTS 从 86 行精简至 54 行，保留独立可读的项目约束，补本机工具替代方式及未提交源码的证据身份。 |
| CI 产物 | 已验证。产物名加入 github.sha，显式保留 14 天，现有权限、Action 提交、测试步骤与上传路径保持不变。 |
| 集中验证 | 已验证。actionlint 与完整仓库上下文的 agnix 均退出 0；本地链接、锚点、空白与本轮补丁范围已复核，不重复运行产品套件。 |

参考已固定 [upload-artifact 的输入定义](https://github.com/actions/upload-artifact/blob/ea165f8d65b6e75b540449e92b4886f43607fa02/action.yml)
和 [GitHub 产物保留期说明](https://docs.github.com/en/actions/tutorials/store-and-share-data#configuring-a-custom-artifact-retention-period)。
本轮只修改本仓库 AGENTS，不改个人全局规则。临时备份和检查结果在 `output/review-20261021/rules-fix/`。

agnix 首次以单文件隔离模式运行，因看不到相邻 VERIFICATION.md 而报告链接不存在，
随后使用完整仓库上下文重查，结果为 0 个错误、0 个警告及 3 条信息建议。信息项涉及工具
版本假设、项目概况和未直接列出构建命令。构建命令已链接现有文档，项目配置保持单一来源，
不为这些启发式建议复制命令或新增配置。actionlint 检查 1 份工作流，无诊断。相关文件的
11 个本地链接及锚点有效。检查只证明静态范围，没有触发远端 CI 或更改已有产物的保留期。

通过逐文件哈希与任务开始前对照，确认本轮仅改动上述四份文件。codex-scope-check 提供
补丁指纹和文件事实，再由源码复核确认范围，不把工具退出 0 当作自动批准。已有产品代码、
README、截图、依赖与测试保持原样。任务备份和日志保留在忽略目录，没有新增常驻进程或
工作区外的配置改动。中文按 humanizer-zh 复核，原报告的模拟编辑与验证边界保持明确。

## 2026-10-21 awesome-jupyter 提名前对照与风格整理

用户要求先检查清单中有哪些值得借鉴的实现，并尽量统一风格。本轮不提交提名、不提交或推送代码、不发布 Marketplace，也不覆盖已有 VSIX。开始时已有的中英文 README、AGENTS.md、旁观评审和 banner 改动保留；本轮只在 README 现有结构上补充内容。

对照固定在 nbdime `744c97897e2c33a1b3f04f5834ee6e70478219a2`、JupyterLab Git `b62a87b719cd151a2c60eaaa6a70a6755784c4ef`、Jupytext `932bcdb243842598acb00f6ab861b645bfc98b6a`。读取了相关 Cell 匹配、差分模型、界面、测试和配对文档；没有安装运行这三个项目，也没有比较其运行性能。本轮无指定论文。

| 工作项 | 当前状态 |
| --- | --- |
| 相关项目源码与本项目对照 | 已阅读并核对；既有唯一 ID、局部锚点、版本快照、输出忽略和计算预算保留。 |
| 悬停框比较双方 | 已验证；基准模式进入已完成快照，原文标 HEAD/index，当前源码标 working copy。真实宿主覆盖切换基准与编辑后过期预览失效。 |
| 原生状态及失败提示 | 已验证；使用内置状态图标，说明具体分析限制及无法匹配的基准 Cell，pending 不显示旧计数。真实 UI 验证警告图标及原因文本可见。 |
| 中英文 README | 已验证；补安装入口、排错和互补工具，保留原有 banner，更新一张真实悬停截图。两份 README 各 14 个本地链接及锚点有效。 |
| 集中验证 | 已验证；typecheck、lint、50 项核心／Git 测试及图标检查通过；VS Code 1.130.0 原生宿主 14 组、UI 38 次截图通过。复用既有套件补断言。 |

可借鉴但留作后续范围：上一处／下一处变更导航、已删除 Cell 的只读列表、长变更预览的上下文折叠，以及真实 Remote WSL 验收。JupyterLab Git 隐藏未变 Cell 的目的可转化为导航；不在原生编辑器中用 DOM/CSS 隐藏 Cell。nbdime 的输出辅助匹配、Jupytext 的忽略格式差异和位置回退不直接采用，避免执行输出或真实空白修改影响源码匹配，也不扩大不可靠匹配的接受范围。

主要来源：[nbdime 多层匹配](https://github.com/jupyter/nbdime/blob/744c97897e2c33a1b3f04f5834ee6e70478219a2/nbdime/diffing/notebooks.py)、[nbdime 删除 Cell 模型](https://github.com/jupyter/nbdime/blob/744c97897e2c33a1b3f04f5834ee6e70478219a2/packages/nbdime/src/diff/model/notebook.ts)、[JupyterLab Git 比较标签与隐藏未变 Cell](https://github.com/jupyterlab/jupyterlab-git/blob/b62a87b719cd151a2c60eaaa6a70a6755784c4ef/src/components/diff/NotebookDiff.ts)、[Jupytext 输入输出匹配](https://github.com/jupytext/jupytext/blob/932bcdb243842598acb00f6ab861b645bfc98b6a/src/jupytext/combine.py)。仅借鉴交互和职责划分，本轮未复制第三方实现或新增依赖。

只读查询确认已有提交 `908483588fcd62cedb545caaece5aca95b51af4c` 的 [GitHub Actions 39489698762](https://github.com/steventimes/git-for-jupyterNotebook/actions/runs/39489698762) 已成功。这证明该提交的远端检查通过，不涵盖本轮未提交改动。Marketplace 页面返回 HTTP 200，其页面数据标明已发布版本 0.1.3、VS Code 要求 `^1.130.0`。本轮没有下载市场 VSIX，因此不把页面元数据当成市场包代码已比对的证据。

本轮使用 Node 24.18.0、Linux、VS Code Desktop 1.130.0，日志及宿主／UI 结果在 `output/review-20261021/`，38 张真实截图在 `output/playwright/product/`。手工检查了修改详情和分析未完成两张新截图。`media/screenshots/change-details.png` 直接复制真实截图，未生成或合成。通过离线 Harper 并人工复核英文，保留 nbformat、MiB、VSIX、publisher ID、英国英语 analysed 及 sentence case 标题等适用写法；修正新增的 README 复数表述。中文已按 humanizer-zh 复核。

`vsce ls` 在受限环境中首次返回空列表；允许的执行环境中重试列出 219 个包文件，确认包含两份 README、CHANGELOG、banner 和产品构建，不包含 AGENTS、旁观评审、测试、脚本、日志或 lockfile。未修改依赖和工作流，不重复运行性能测量，不将本轮样式整理标成跨平台验证。Windows/macOS、真实 Remote SSH / WSL 界面仍未在本轮验证。现有 0.1.3 VSIX 保持原样，本轮改动记录为 Unreleased，尚未打包或发布。

结束时已清理本轮 `/tmp` 中下载的第三方源码，仅在验证目录保留固定来源的元数据；原有未提交文件保留。最终英文检查返回 28 条已人工复核的术语、标识符、单位、方言与标题风格建议。最后仅修正未知错误提示中的重复句号，重新执行 typecheck 与 lint；没有因标点修改重跑宿主或 UI。

## 2026-10-20 全面评估与 0.1.3 进度

本轮先审查当前 0.1.2 工作树，随后按用户要求修复、优化并升级至 0.1.3，最后更新文档、集中验证和打包。本地验收完成后，用户追加授权以 `compatibility update` 提交并推送至 `origin/main`，包括公开说明需要的新截图。Marketplace 发布仍需另行操作。下方 0.1.2 章节保留为历史记录，本轮结果以此节为准。

| 工作项 | 当前状态 |
| --- | --- |
| 全部项目文件与相关官方资料 | 已阅读，无指定论文。手工复核产品、测试、脚本、配置、文档与许可。第三方类型和 lockfile 做结构、来源与哈希检查，不声称逐行审计第三方代码。 |
| 成熟扩展对照 | 已阅读 VS Code Git、GitLens 跟踪器及 CI、Git Graph 历史路径处理实现，结论与采用范围已汇总。 |
| 新安装 skill | 已阅读 system-design-engineering 及其参考，用于身份、缓存、容量和失败恢复。plugin-extensibility 自身明确排除普通 VS Code 扩展开发，未套用。其余新语言技能与本项目语言不符。 |
| 最低版本与 0.1.3 元数据 | 已验证，1.130.0 与 1.142.0 各通过 14 组原生宿主及 37 次 UI 截图验收。最终 VSIX 在 1.130.0、1.140.0、1.142.0 各通过 14 组安装宿主检查。 |
| HEAD 缓存身份竞态 | 旧实现已由确定性 Git/API 时序探针及 1.141.0、1.142.0 原生宿主复现。已验证，不可变提交读取的确定性时序探针及两版原生 checkout 回归均通过。 |
| Git 并发与队列 | 已验证，80 个真实 Notebook 读取峰值为 4 次未完成 Git 调用，242 次调用只读取同一 blob 一次。队列上限为 128。 |
| 源码采集预算 | 已验证，2001 个 Cell、错误基准和总源码超限均在 getText 前返回，真实宿主也覆盖当前 Notebook 的 2001 Cell 边界。 |
| 分屏详情与自动化隔离 | 已验证，两版各 37 次 UI 截图包含左右分屏原位详情，端口和临时工作区归属检查通过。 |
| 文档与 CI | 使用说明、限制、更新日志及最低版/稳定版 CI 矩阵已更新。远端 Actions 未执行。 |
| 集中验证与最终 VSIX | 已验证。最终 VSIX、三版安装检查、文件一致性及本轮临时文件清理均完成。 |

## 全面评估结论与修复依据

项目的方向和分层可以保留。原生 Cell 内比较未保存源码、HEAD/index 双基准、结构化 Notebook 规范化、保守对齐、版本化渲染及只读 Git 边界，已经形成可维护的产品基础。当前最重要的质量标准是标记能否对应正确的源码版本与 Git 提交。

本轮检查了开始时工作树中的 98 个项目文件。包括 13 个产品 TypeScript 模块，本轮修改后共 1129 行，以及算法和真实 Git 测试、原生宿主与 UI 流程、打包脚本、配置、图标、示例和许可。原有未提交修改保留。审查前的公开提交是 `983209e14a428bfd117ab37896e6fbb965b0b980`，不能将它当成本轮修复后的源码身份。未取得 Marketplace 已发布 VSIX 做独立源码比对，所以这里的运行结论只对应本地源码和明确记录的本地安装包。

### 参考成熟项目时采用的标准

对照范围包括微软内置 Git 的 Quick Diff 路径、GitLens 的文档跟踪及 CI，以及 Git Graph 的历史路径处理。GitLens 固定在 `a9bc0f000eb4221bfeff4a1b03e624f478c96141`，阅读其文档跟踪器全文和相关配置。Git Graph 固定在 `881a9e613045bacbbadf8940f6b6c5b8bd699335`，该版本来自 2021 年，仅作为历史实现参考，不能称为当前维护标准。

值得采用的是文档身份明确、仓库事件分类、资源随关闭释放、最低版本有实际测试，以及验证安装包本身。GitLens 的账户、云端功能和较大的基础设施不适合复制到本项目。微软 Git 使用进程并发限制，支持为这里的多 Notebook 读取增加上限；其内部 Quick Diff Widget 依赖 Workbench 模型，不能直接作为稳定扩展 API 调用。

对应来源为 [GitLens documentTracker](https://github.com/gitkraken/vscode-gitlens/blob/a9bc0f000eb4221bfeff4a1b03e624f478c96141/src/trackers/documentTracker.ts)、[GitLens CI](https://github.com/gitkraken/vscode-gitlens/blob/a9bc0f000eb4221bfeff4a1b03e624f478c96141/.github/workflows/ci.yml)、[VS Code Git model](https://github.com/microsoft/vscode/blob/1.142.0/extensions/git/src/model.ts) 和 [官方扩展 CI 文档](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)。这是针对本项目问题的源码对照，没有穷尽市场，也没有认定某个同类扩展的全部实现都正确。

### 采用的技能与适用边界

| 技能 | 实际用途 |
| --- | --- |
| code-reviewer | 全工作树正确性、维护成本和回归风险 |
| security-best-practices | Git 执行、路径、Workspace Trust、Markdown 与依赖边界 |
| dependency-manager | 锁定图、安装版本、公告接口与升级风险 |
| performance-optimization | 冷热分析、重算量、Git 并发和源码采集计数 |
| frontend-design | 原生编辑流程、分屏目标、主题和错误状态 |
| playwright | 使用现有套件操作真实 VS Code 窗口、保存实际截图 |
| ponytail | 沿用现有模块修复，不引入框架、服务或新的插件系统 |
| system-design-engineering | 新安装技能，检查基准的权威身份、缓存一致性、队列上限和失败恢复 |
| chinese-writing、humanizer-zh | 组织和复核本报告及中文说明，保留证据的范围和不确定性 |
| stop-slop | 英文 README、changelog 的表达复核，并调用离线 Harper |
| hindsight-memory | 召回历史产品约束，以当前源码和用户指令为准 |

新安装的 plugin-extensibility 明确要求跳过普通 VS Code 扩展开发，除非是在建设可复用的宿主扩展机制。这里没有此需求，因此没有新增 registry 或 provider 框架。Java、Python、Rust 和 Go 技能与产品语言不符。没有为了扩大技能数量而引入不相关流程，也没有声称运行 Codex Security 多轮扫描器。

### 已确认的问题及处理

| 优先级 | 问题与证据 | 本轮处理与验收目标 |
| --- | --- | --- |
| P1 | HEAD 缓存键来自 Git API，但 loader 独立读取实时 HEAD。API 停留 A 时读到 B，会把 B 缓存在 A 名下；切回 A 后仍能显示 ready 和错误修改。确定性真实临时 Git 探针及 1.141.0、1.142.0 原生宿主均复现。 | `git.ts` 每个仓库事件周期解析一次真实提交，`gitReader.ts` 固定读取同一个不可变提交。确定性探针及原生 A→B→Refresh→A 检查均通过，不需再次手动刷新，键盘输入也不运行 Git。 |
| P1，兼容性 | `engines.vscode=^1.141.0` 在执行产品代码前拒绝用户的 1.140.0。 | 版本升为 0.1.3，最低声明改为 1.130.0，并锁定该版本官方类型。最低版原生宿主和可见 UI 已通过，最终包也在用户遇到问题的 1.140.0 上安装并回归通过。最低声明采用已验证版本，不声称 1.130.0 是所有 API 能运行的最早版本。 |
| P2 | 基准错误时仍读取所有当前 Cell；2001 个 Cell 超限之前也已调用 2001 次 getText。受控文档计数探针复现，并非 GUI 卡顿测量。 | Cell 数先检查，错误基准不采集当前源码；总源码长度先做预算，再复制文本，每十个 Cell 让出宿主。超限明确显示 incomplete，不显示无修改。 |
| P2 | 80 个 Notebook 读取同时产生最多 80 个未完成 execFile 调用，虽然相同 blob 已合并。此数字是调用到回调期间的并发计数，不等于 80 个 OS 进程同时占用 CPU。 | 最多 4 个 Git 子进程、128 条排队命令。队列满返回 git-busy，提示 Refresh，不无限排队。继续复用同 OID 的读取与解析。 |
| P2 | 分屏中点击左侧 gutter 的 Show Change，旧逻辑使用活动 Notebook 的 viewColumn，实际在右侧显示详情。已有真实截图。 | 官方菜单只传 URI/行号，无分屏身份。多个可见副本时提示使用对应源码悬停，不猜测目标；单个副本使用实际 Notebook 编辑器列。两侧源码悬停继续使用原生 HoverProvider。 |
| P2，测试工具 | 固定 CDP 9335 和第一个页面没有目标归属检查。静态确认风险，未声称已经操作过用户其他窗口。 | 测试分配独立端口，只连接本轮临时工作区标题对应页面。 |
| 发布门槛 | README 的新详情截图被改写为 GitHub main URL，但公开分支仍为旧源码，该 URL 实查 404。旧包记录仅有 HEAD 和 dirty，不能唯一还原源码。 | 安装验证记录补充工作树源码文件哈希，排除不断追加的本验收记录。GitHub 图片需在用户允许提交和推送源码后才会可访问，本轮不擅自推送。 |

错误状态同时改为用户可读说明，例如基准 JSON 损坏、合并冲突、Git 尚未就绪和队列满。稳定错误码仍在诊断和限频日志中保留。状态栏增加无障碍标签，不增加弹窗或遥测。

### 保留的正确设计与安全结论

当前源码来自 Cell TextDocument，不依赖磁盘保存、Python 或 kernel。source 数组按 join('') 拼接，只规范化 CRLF，不 trim；输出、执行次数和无关 metadata 不参与源码 diff。合法唯一 nbformat ID 优先，重复 ID、安全降级、精确源码核对、一对一映射和不完整候选不能升级为 session 身份的约束保持不变。

Git 使用内置扩展公开 API 定位仓库和监听状态。因为内置 show/buffer 会使用 textconv，读取采用受限 execFile 参数数组和原始对象；没有 shell、外部 diff、clean filter、自动暂存或回滚。继承 GIT_* 环境、promisor 远端 helper、目录别名、worktree、嵌套仓库、冲突和非法基准都有相应保护或测试。Hover Markdown 不可信且禁用 HTML，源码预览截断有界。

审查前 lockfile 的 npm 公告查询报告生产和开发依赖 0 个已知漏洞，依赖图无缺失。存在可升级的开发工具版本，但没有证据要求替换 diff 或跨大版本升级 TypeScript/Node 类型，因此保留锁定版本。零公告不等于不存在漏洞。本轮未发现已验证的远程执行、凭据泄漏或 Git 写入漏洞，也未把普通显示错误包装成安全漏洞。

### 产品边界与后续改进

原生 gutter 装饰、源码悬停详情、双基准和 Cell 汇总形成完整的只读编辑反馈。整 Cell 删除没有存活编辑器，只在汇总中计数。下一步可考虑跨 Cell 导航和已删除 Cell 的只读列表，但本轮没有擅自添加这些功能或 Git 写操作。

仍有以下限制。8 MiB 原始基准上限包含图片输出，少量源码也可能因大输出无法比较。没有流式 JSON 或后台解析。缺少可靠 ID/session 时，同时跨顺序锚点移动并修改的 Cell 可能保守地显示 uncertain，不能声称推断任意拆分、合并或历史。对过大输入应保持未完成状态，而不是把整本染绿。

装饰路径是 `visibleTextEditors` → Cell document URI → `createTextEditorDecorationType` → `TextEditor.setDecorations`，详情是公开 HoverProvider。四套 SVG 调色板不能完全跟随任意自定义 gutter 颜色；断点和其他扩展装饰仍可能争用位置。红色三角受公开图标行框限制，无法跨行外溢。实际 QuickDiffProvider 对照里普通文件有请求并能左键内嵌，Notebook Cell 请求为零，不能承诺复用 Git 原生左键 Widget。

本地 Linux 通过不等于 Windows、macOS、Remote SSH/WSL 已经视觉验收。extensionKind 为 workspace，远端 Git 应在远端宿主读取，但远端 GUI 尚未重跑。不支持 Web、虚拟工作区和未信任工作区。源码可用许可证及历史 MIT 授权保留，没有把源码可用误称为标准开源许可，也不保证许可证能阻止独立重写。

### 验证结果与产物

修复后的 typecheck、lint 和 npm test 实际通过，共 35 个核心测试和 15 组真实 Git 测试，50 项无跳过。1.130.0 和 1.142.0 各通过 14 组原生宿主检查与完整 UI，每版各 37 次实际窗口截图。路径在 `output/review-20261020/final-013/`。截图已检查两侧原位详情；API 调用成功、算法通过和实际可见分别留证。

新增覆盖集中在现有测试中。Git 集成增加固定 HEAD 身份和 80 个并行读取两项，宿主增加快速提交/刷新/checkout 与 2001 Cell 两组；基准错误跳过源码的断言并入已有错误恢复检查。没有添加与实现逐行对应的琐碎测试，也没有重复执行 npm test 已包含的同一 Git 套件。

第一次 1.130.0 UI 在分屏行末详情悬停处超时。自动操作随后明确点击目标源码获得编辑焦点，并只查找可见原生悬停框；最低版和稳定版完整回归通过。保留 `ui-1.130.0-first-failure.log` 和对应失败截图，没有把首次失败算成通过。缺少个人窗口访问不是此次失败原因，测试始终使用独立用户目录和 CDP 端口。

新的性能测量使用 Node 24.18.0、Linux x64、Xeon Gold 6240R 2.40 GHz、96 个逻辑 CPU，其他进程负载未隔离。只测分析层，不含 Git、源码采集、UI 或 200 ms 防抖。

| 输入 | 本轮实测 | 重算 Cell |
| --- | --- | --- |
| 300 个 Cell，每个 40 行，冷分析 | 5.489 ms | 300 |
| 编辑其中一个 Cell | 2.785 ms | 1 |
| 同一 Cell 连续编辑 30 次 | 0.728–2.298 ms，均值 1.113 ms | 每次 1 |
| 开头插入一个 Cell | 1.676 ms | 1 |
| 单个 5000 行 Cell | 3.180 ms | 1 |

可靠 ID 场景 hash 字符量为 0，前插仅 hash 新 Cell 的 10 个字符。80 Notebook 读取前后总 Git 调用仍为 242、blob 读取仍为 1；改进是并发峰值从 80 降至 4，不声称减少了 80 倍 I/O。尚未测量端到端 p50/p95、最大宿主停顿或多 Notebook 总内存。32 个 blob 的共享缓存上限不等于全部已打开 Notebook 状态的内存上限。

英文离线 Harper 实际返回 19 项建议，已逐项复核，均为 VSIX、JGM、UTF、nbformat、QuickDiffProvider、publisher、MiB/ms、index 与现有标题风格等术语或格式选择，没有盲目替换。本轮 lockfile 仅调整根版本与 engine，已核对 259 个解析依赖项与审查时相同，故复用本轮实际 npm audit 的 0 个已知公告结果，不将旧依赖扫描冒充新版本变更后的扫描。

最终本地包为 `notebook-git-gutter-0.1.3.vsix`，557,343 bytes，SHA-256 为 `88a4f76faed262ac217f9fb2d1f3977aba2d4a3f14a05749267387a30add65be`。包的版本为 0.1.3，最低 VS Code 声明为 `^1.130.0`。220 个条目的 ZIP CRC 通过，26 个编译文件和 48 个媒体文件逐字节匹配，图标为 45,044 bytes。开发脚本、测试、原始会话、截图附件和类型快照没有进入 VSIX。

同一个包分别安装到三个独立用户目录，通过如下检查。

| 实际运行环境 | 开发目录宿主 | 真实 UI | 最终 VSIX 安装宿主 |
| --- | --- | --- | --- |
| VS Code 1.130.0，Linux x64 | 14 组通过 | 37 张验收截图 | 14 组通过 |
| VS Code 1.140.0，Linux x64 | 复用安装宿主，不重复独立开发目录检查 | 本轮隔离候选曾通过完整 UI；最终代码以最低版和稳定版视觉回归为依据 | 14 组通过 |
| VS Code 1.142.0，Linux x64 | 14 组通过 | 37 张验收截图 | 14 组通过 |

每份安装收据记录相同包哈希，以及 97 个源码、资源和配置文件的哈希。本验收文件持续追加，不纳入该源码指纹。三个收据已逐项核对与最终文件一致，源码没有仅用旧 HEAD 代替。第一次包文件比较发生在另一个检查重建 out 时，因本地编译文件暂时不存在而未完成；全部安装检查结束后已顺序比较通过，没有据此修改或放宽产品断言。

SDK 快照来自 [官方 1.130.0 vscode.d.ts](https://github.com/microsoft/vscode/blob/1.130.0/src/vscode-dts/vscode.d.ts)，SHA-256 为 `ee11e767c8ab76f6c0de8dc88222796147a6f0bc82f3a1ec644e41b39b52f2cd`。使用的 Git API 成员与同版本公开声明核对，记录在 `types/VERSION.json`。安装范围受 [manifest engines](https://code.visualstudio.com/api/references/extension-manifest) 控制；此次修复既修改元数据，也验证了实际运行，没有要求用户开启 proposed API。

清理已完成。删除本轮 `/tmp/ngg-review-20261020-04ife6tb`、重复候选包、可重建 out 和本轮通信文件，保留源码、原有运行环境、node_modules、旧发布包与本轮证据。已验证的 1.130.0 测试运行环境移动到 `.vscode-test/vscode-linux-x64-1.130.0`，实际调用默认测试启动入口确认能复用，避免下次再次下载。清理前后 98 个项目文件不变，最终 VSIX 哈希和 CRC 再次核对通过。本地验收阶段没有提交或发布。后续授权的提交不会修改已验证的 VSIX，源码和资源的 97 个指纹仍与安装收据一致。

安装时在 VS Code 选择 Extensions → … → Install from VSIX，选择本地 0.1.3 包。若从终端安装，执行 `code --install-extension ./notebook-git-gutter-0.1.3.vsix --force`。Remote SSH/WSL 需要选择对应远端扩展宿主。

**发布与平台边界。** 本地验收时公开 GitHub main 仍为 0.1.1，新增详情截图的公开 URL 返回 404。用户随后授权的提交包含 0.1.3 源码、文档和新截图，公开图片资源将随本次推送同步。Marketplace 可上传本轮已验证的包，不需要仅因提交源码而重打包。GitHub Actions 矩阵已配置，本地等价检查已通过，远端结果以实际 Actions 运行记录为准。Windows、macOS、Remote SSH/WSL 的实际 GUI 和 Marketplace 已发布包的独立对照仍未验证。

此前 0.1.2 的基准复核实际通过 48 项单元/Git 测试、1.141.0 与 1.142.0 各 12 组安装宿主，以及 1.142.0 完整原生 UI；这些历史通过不能代替本轮源码回归。新发现的 checkout 失败记录保留在 `output/review-20261020/host-review*.log`，失败没有被计作通过。

---

## 历史 0.1.2 验收

首次验证日期为 2026-10-08，安全修复和测试整合后的回归日期为 2026-10-15，0.1.2 正确性与交互修复的回归日期为 2026-10-17。平台为 Linux x64，VS Code Desktop 1.141.0，Git 2.43.0，构建工具 Node.js 24.18.0。GUI 在 Xvfb 的 1440×1000 虚拟显示中运行，截图来自实际 VS Code 窗口。测试使用独立用户目录、扩展目录和临时 Git 仓库。

## 版本和公开 API

选型时，[微软 stable 更新接口](https://update.code.visualstudio.com/api/update/linux-x64/stable/latest) 返回 1.141.0，提交为 `2a59476c9bfcb90b3ddc372c36762471b7dfad1c`。官方 Linux 归档的 SHA-256 实际核对为 `d77d588f0454cbaaa71e723497de4160d15b95fba4988abe177b1432e6bd570a`。

类型定义来自对应 [1.141.0 标签的 vscode.d.ts](https://github.com/microsoft/vscode/blob/1.141.0/src/vscode-dts/vscode.d.ts)，保存在 `types/vscode.d.ts`。当时 npm 的 `@types/vscode` 最新版为 1.140.0，因此使用官方版本快照。其 SHA-256 为 `a4321528e86dcdcb8450287f2a263055c46a622119cdb186de85ac3b19ce9608`。版本和校验信息也保存在 `types/VERSION.json`。

装饰路径为 `window.visibleTextEditors`，通过 `TextEditor.document.uri` 与 `NotebookCell.document.uri` 相等来定位编辑器，然后调用 `createTextEditorDecorationType({ gutterIconPath })` 和 `TextEditor.setDecorations`。监听可见编辑器变化、文本变化和 Notebook 结构变化。类型检查、真实宿主 API 调用和可见截图均已分别验证。

官方依据为 [API 参考](https://code.visualstudio.com/api/references/vscode-api)、[issue 114440](https://github.com/microsoft/vscode/issues/114440#issuecomment-765050520)、[decorator sample](https://github.com/microsoft/vscode-extension-samples/tree/main/decorator-sample) 和 [对应版本的编辑器同步源码](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/api/browser/mainThreadDocumentsAndEditors.ts)。

[内置 ipynb serializer](https://github.com/microsoft/vscode/blob/1.141.0/extensions/ipynb/src/deserializers.ts) 把 nbformat Cell ID 放在 `cell.metadata.id`。实现仅接受合法、唯一的 ID。Cell URI 用作当前会话身份，不作为永久 ID。

Git 仓库和状态监听使用 [内置 Git API v1](https://github.com/microsoft/vscode/blob/1.141.0/extensions/git/src/api/git.d.ts)。其仓库 getter 每次创建新包装对象，因此以 root URI 管理监听器。`show` / `buffer` 的 [实际实现](https://github.com/microsoft/vscode/blob/1.141.0/extensions/git/src/git.ts) 会启用 `--textconv`，所以读取使用参数数组调用本地 Git 的 `rev-parse`、`ls-files`、`ls-tree` 和 `cat-file blob`。每条命令限制 5 秒和 8 MiB 输出，禁用 fsmonitor、pager、replace objects 和可选锁。重命名只接受 API 明确提供的 rename 状态与旧路径，copy 不作为 rename。

本次审查复现了部分克隆缺失对象时的隐式远端读取。现在为 Git 设置 `GIT_NO_LAZY_FETCH=1` 和空的 `GIT_ALLOW_PROTOCOL`，后者也阻止 Git 2.43.0 的远端传输及 helper。子进程不继承 `GIT_*` 上下文、注入配置或 trace 目的地。临时仓库的写操作复用同一环境隔离，并单独禁用用户和系统 Git 配置及 hooks。Notebook 在逐 Cell 规范化前检查 2000 个 Cell 上限。

## 0.1.2 原生详情与 Quick Diff 探针

详情使用公开的 `languages.registerHoverProvider`、`MarkdownString` 和 `editor.action.showHover`，在当前 Cell 内显示修改前、修改后或已删除的源码。容器、主题和代码块均由 VS Code 原生悬停框负责，没有 Webview、自定义 DOM 或 CSS。最终产品不调用 `vscode.diff`，也不另开对比标签页。日常编辑仍在原生 Cell 中显示行级标记。

当前操作为行号或标记区域右键后选择 Show Change。公开的装饰 API 没有左键点击回调，真实 gutter 点击也没有触发 TextEditor selection 事件。不能把右键入口说成已经实现了左键内嵌预览。

核对了官方 [SCM QuickDiffProvider](https://code.visualstudio.com/api/extension-guides/scm-provider#quick-diff)，并使用同一 provider 给普通文件和 Cell 提供相同源码基准。实验中的 provider 不设置 root URI，避免 file 与 vscode-notebook-cell scheme 的仓库过滤影响结论。普通文件实际显示了内置标记，左键点击实际打开了 Git 的内嵌差分。随后聚焦真实 Cell TextEditor，调用 Show Next Change，仍无内置标记或内嵌窗口，provider 的请求计数为普通文件 3 次、Cell 0 次。

这与对应版本源码一致。[QuickDiffWorkbenchController](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/contrib/scm/browser/quickDiffDecorator.ts#L408) 只处理 EditorService 的可见普通文本编辑器，[EditorService](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/services/editor/browser/editorService.ts#L496) 不展开 Notebook 内部的 Cell，而 [QuickDiffModelService](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/contrib/scm/browser/quickDiffModel.ts#L85) 要求已解析的文件文本模型。Notebook Cell 使用的不是该模型。直接调用 Git 或复制 Widget 的源码不能消除这些宿主内部依赖。因此当前仍未实现与普通文件完全相同的左键内嵌交互。

当时的最小对照入口为 `NGG_UI_QUICKDIFF_ONLY=1 npm run test:ui`，现已退役；固定结果在 `output/playwright/product/quickdiff-evidence.json`，截图为 `21-native-quickdiff-file.png`、`22-native-quickdiff-click.png` 和 `23-native-quickdiff-notebook-unsupported.png`。现行 UI 不再重复这项外部 API 能力调查。原测试只操作独立临时仓库和用户目录。

内置删除三角采用 [内部 CSS](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/contrib/scm/browser/media/dirtydiffDecorator.css#L116) 在行框外绘制 4×8 px 三角。公开 gutterIconPath 是行框内的背景图，无法跨行绘制相同外溢。当前 SVG 使用带留白的完整小三角，分别靠近行顶和行底，不再使用折角或被截断的半个图形。同一行同时有修改和删除时使用一个组合图标，避免两类装饰互相覆盖。

预览只消费版本一致的 Cell 分析，异步任务在焦点切换后再次核对版本和请求序号。源码通过不可信 Markdown 的代码块提供，HTML 与 command URI 均不能执行。每段最多 4000 个字符，截断时不拆分 Unicode 代理对，并明确提示；末尾没有换行也会注明。宿主测试覆盖代码围栏、command URI、HTML、Unicode 截断和 pending 失效。

蓝色和绿色使用完整行高的竖条。红三角放在竖条旁边，不再为了避让删除符号而截短蓝条或绿条。基础图标和组合图标使用一致的伸缩方式，避免不同图标呈现不同的垂直位置。

交互修复的最终 UI 回归实际通过，保存了 36 个窗口截图，覆盖 Cell 内原生悬停框、没有独立对比编辑器、完整蓝条与旁侧红三角、源码删空、末尾删除、四种主题和分屏。宿主 12 组检查也通过。UI 调试中修正了原生弹窗容器选择器、Monaco 不换行空格和窄分屏内联布局的测试选择器；最终产品按用户选择保留原位悬停框，没有使用独立 Diff 标签。测试失败日志保存在 `output/verification/interaction-20261017/`，没有把旧测试结果当成最终通过结果。

## 自动验证

| 入口 | 验证内容 |
| --- | --- |
| `npm run typecheck` | TypeScript strict，使用锁定的官方类型 |
| `npm run lint` | 源码、探针、脚本和测试 |
| `npm test` | 35 个核心用例及下述 13 组 Git 集成测试，共 48 个，无需 GUI |
| `npm run test:integration` | 只运行 13 组 Git 测试，含目录整体重命名后的旧路径读取、 intent-to-add、目录别名与文件 symlink 区分、OID 缓存、包含输出的文件大小上限，以及 HEAD/index、stage 后继续修改、无 HEAD、worktree、特殊路径、冲突、读取失败、promisor helper 阻断和继承环境隔离 |
| `npm run test:host` | 12 组真实宿主检查，含源码预览的安全边界与过期失效、pending 期间的坐标与汇总失效、连续输入装饰去重、raw/code 与 code/code 语言切换、Notebook Diff Tab 释放，以及 URI 映射、未保存输入、debounce、增量计算、输出 metadata、Git 事件、禁用与关闭清理、多根、文件夹覆盖、rename 和嵌套仓库 |
| `npm run test:ui` | 实际渲染节点与 PNG 截图验证 |
| `npm run benchmark` | 生成输入后的实际分析耗时和重算数量 |

上述验证已实际运行。完整源码工作区中的宿主结果留存在 `output/verification/host-results.json`，UI 证据在 `output/playwright/product/evidence.json`。正确性修复日志在 `output/verification/review-20261017/`，交互修复日志在 `output/verification/interaction-20261017/`。最终 0.1.2 的重新验收日志在 `output/verification/version-012/`。

旧单 Cell 自动测试及独立探针的重复自动交互已移除，F5 最小探针仍保留。Undo、Cell 插入、滚动和分屏的完整验收集中在 UI 套件，避免宿主重复执行相同流程。纯 generation 计数器测试并入实际异步分析用例，验证旧任务及关闭中的任务不会覆盖新缓存。重复的单 Cell ID 替换断言并入 2000 个 Cell 的边界用例。Git 安全回归全部保留。三个 VS Code 测试入口共用启动器和临时夹具，宿主与 UI 共用 Notebook 辅助函数。

2026-10-17 的 0.1.2 验证中，`npm audit` 查询了官方 npm 公告接口，生产和开发依赖均报告 0 个已知漏洞。类型快照 SHA-256、manifest 与 lockfile、JSON 配置、当时的 12 个 SVG 和扩展能力声明均已核对。首次宿主启动因受限执行环境的 Electron `EPERM` 失败，随后在允许的执行环境中运行通过，没有修改测试断言。

UI 流程包含三类未保存行级变化、其他 Cell 和输出焦点、滚动离开返回、Undo 清空标记、前插 Cell 不污染后续 Cell、输出更新、分屏一致、四种主题、禁用后重新创建编辑器、刷新、源码删空、Markdown 源码和预览状态，以及同一行断点。输入通过真实键盘事件，Undo 和滚动分别调用 VS Code 原生 undo 与 Notebook reveal API。输出由测试专用 NotebookController 产生，没有调用 Python kernel。截图不是生成的示意图。

## 0.1.2 修复依据

新增的 5 个算法回归测试先在旧实现上失败，分别复现非 BMP 计数、13 个局部编辑区间、未完成竞争检查、受限时钟下的 session 升级和 5000 行纯新增／删除。Git 的 intent-to-add 与目录别名回归也先复现失败。真实宿主中的 pending 测试先确认旧坐标仍在渲染，修复后验证受影响 Cell 的标记先清除，插入 Cell 时汇总不串到新 index，连续 12 次 pending 编辑不继续提交装饰。

相似度配对现在要求整个有界局部区间完成全部兼容候选检查。超时、单对 diff 返回 undefined 或超限候选都保留为未知，不接受该区间的 similarity 配对，也不将其保存为确定的 session 身份。可靠 ID、精确源码和序列锚点仍可保留。分母和 diffChars 的计数统一采用 Unicode code point。已完成结果记录 Cell URI、文本版本、generation、基准身份和匹配证据，gutter 与 Cell summary 读取同一份结果，结构与基准变化时整份失效。

Git 失败结果仅在同一仓库事件周期内缓存，编辑期间不重复启动 Git。仓库状态变化时清除失败项，旧事件周期中尚未完成的失败也不能留入新缓存。真实宿主通过损坏 HEAD、连续未保存输入、后续提交恢复来验证这一点。读取按 root 与 blob OID 共享成功的规范化源码，最多缓存 32 个对象、合计 8,000,000 个源码 UTF-16 单元，关闭仓库最后一个 Notebook 后释放。仓库事件仍重新确认 index 条目，但相同 OID 不重复读取或解析 blob。目录别名只解析父目录的 realpath，不跟随文件 symlink。旧目录随重命名消失时，解析最近的现存祖先后保留缺失的路径后缀，继续进行仓库边界检查。这一新增回归先复现失败，再完成修复。

intent-to-add 使用只读 `ls-files --debug -z` 的 index flags，与真正暂存的空文件区分。依据为 [Git 2.43.0 的 CE_INTENT_TO_ADD 定义](https://github.com/git/git/blob/v2.43.0/read-cache-ll.h)和 [ls-files 实现](https://github.com/git/git/blob/v2.43.0/builtin/ls-files.c)。[官方手册](https://git-scm.com/docs/git-ls-files#Documentation/git-ls-files.txt---debug)说明 debug 格式并不稳定，所以无法识别时返回 `unsupported-index-flags`，不会猜测空基准。没有为此使用可能触发仓库 clean filter 的工作区 diff 或 status。

原始基准仍有 8 MiB 上限，包含图片输出和 metadata。新测试确认大输出、少源码也会明确返回 `baseline-too-large`，并在读取 blob 前拒绝。两份 README 已写明这一限制。本次没有实现流式 JSON 提取，也没有扩大原始文件读取上限。

`.github/workflows/ci.yml` 固定 Node 24.18.0 与 Actions 提交，使用 npm lockfile。流程执行静态检查、普通测试、Linux 原生宿主和 UI、性能测量、打包以及同一 VSIX 的安装测试，不发布 Marketplace。当前只完成本地等价验证，GitHub Actions 尚未在远端运行。英文文档通过 Harper 检查后人工复核了 19 项建议，保留 VSIX、JGM、nbformat 等术语和现有标题风格，修正 changelog 的标点与拼写。

## 性能测量

CPU 为 Intel Xeon Gold 6240R 2.40 GHz，系统报告 96 个逻辑 CPU。测量一次冷分析和 30 次连续热编辑，仅统计分析层，不包含 Git I/O、UI 绘制或默认 200 ms debounce。同机其他进程的负载未隔离。

| 输入 | 实测耗时 | 重算 Cell 数 |
| --- | --- | --- |
| 300 个 Cell，每个 40 行，冷分析 | 5.29 ms | 300 |
| 其中一个 Cell 编辑 | 2.75 ms | 1 |
| 同一 Cell 连续编辑 30 次 | 0.73–5.38 ms，均值 1.24 ms | 每次 1 |
| 在 300 个 Cell 开头插入 Cell | 1.68 ms | 1 |
| 单个 5000 行 Cell，修改一行 | 3.69 ms | 1 |

本次可靠 ID 匹配下，冷分析、单 Cell 编辑、30 次连续编辑和长 Cell 的 hash 字符量均为 0，前插仅 hash 新 Cell 的 10 个字符。没有测量输入到 UI 绘制的端到端 p50/p95。原始样本保存在 `output/performance.json`。这些数字是当前机器的一次测量，不是跨设备保证。

## 本地包验收

执行 `npm run package` 生成 `notebook-git-gutter-0.1.2.vsix`。随后执行 `npm run test:vsix`，把该 VSIX 安装到临时扩展目录，以独立测试 harness 运行相同的宿主套件，避免开发目录覆盖安装包。结果写入 `.tmp/vsix-host-results.json`，本次结果留存在 `output/verification/vsix-host-results.json`。启动器核对安装前后 VSIX 的 SHA-256，并在通过后写入 `output/release.json`，记录文件大小、哈希、VS Code 与扩展版本、源 HEAD、工作区是否有改动和通过项目。本次源码尚未提交，因此 sourceCommit 是基准 HEAD，workingTreeDirty 为 true，不能将该 HEAD 单独当成修复后的源码身份。

最终发布版本按用户要求统一为 0.1.2，manifest、lockfile 和更新日志一致。本次重新执行 typecheck、lint 和 48 项单元／Git 测试，均通过；重新生成的 VSIX 在隔离安装后通过 12 组真实宿主检查。最终包为 554,355 bytes，SHA-256 为 `ed227765280913ea38ad7adc758133596d1a15e02d590f6ee0497a82db0e2ebb`。26 个编译文件及 48 个媒体文件与上一轮原生 UI 验收的构建逐字节一致，功能与图标没有改变，因此本次未重复整套 UI 流程。重新验收日志在 `output/verification/version-012/`。旧包备份及试验性的 0.1.3 包已按用户要求清理。

2026-10-18 清理已完成。本轮日志和宿主结果已集中留存，真实截图、性能样本和发布校验记录保持原位。已移除重复下载的 VS Code 压缩包、项目内 npm 缓存、废弃测试用户目录与临时仓库、测试通信文件和可重建的 `out/`。保留已安装的测试用 VS Code 运行环境及 `node_modules/`。清理后核对全部源码及资源与清理前一致，最终 0.1.2 VSIX 的 SHA-256 不变，压缩包完整性通过；本次没有重复运行功能测试。

VSIX 仅包含编译后的产品代码、SVG、插件图标、真实运行截图、运行时 diff 库及许可证、演示 Notebook 和中英文使用说明。本文中的开发步骤、验收记录、测试代码、浏览器工具、日志、类型快照和个人配置不进入包。安装方式见 README。

当前没有运行 Windows、macOS 或 Remote SSH / WSL 的 GUI 验收。Web 和虚拟工作区不受支持。复杂重复 Cell、拆分或合并可能无法可靠匹配，超出明确计算上限会显示未完成分析。默认断点与窄条在本次测试中可以共存，其他扩展的 gutter 装饰仍可能重叠。

</details>
