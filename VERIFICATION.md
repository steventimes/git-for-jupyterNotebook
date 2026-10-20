# 验收记录与复现

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

最小对照实验可单独执行 `NGG_UI_QUICKDIFF_ONLY=1 npm run test:ui`，实际结果在 `output/playwright/product/quickdiff-evidence.json`，截图为 `21-native-quickdiff-file.png`、`22-native-quickdiff-click.png` 和 `23-native-quickdiff-notebook-unsupported.png`。完整 UI 流程也包含这组对照。测试只操作独立临时仓库和用户目录。

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

## 构建与调试


使用 Node.js 22.13+ 和 npm。依赖版本由 `package-lock.json` 锁定。先运行 `npm ci --ignore-scripts`，随后可执行：

```sh
npm run typecheck
npm run lint
npm test
```

`npm test` 编译一次，运行 35 个核心测试和 13 组 Git 集成测试，不需要 GUI。构建会先清理 `out/`，避免已删除测试的编译产物继续残留。其他检查按需要运行：

| 命令 | 用途 |
| --- | --- |
| `npm run test:integration` | 单独排查 Git 集成问题，已包含在 `npm test` 中 |
| `npm run test:host` | 12 组真实宿主检查，覆盖源码预览、缓存、Git 事件、资源释放和多仓库 |
| `npm run test:ui` | 原生 Notebook 的行级标记、Undo、Cell 插入、滚动、分屏及主题验收 |
| `npm run benchmark` | 测量大型 Notebook 和连续编辑的分析耗时 |
| `npm run package` | 生成本地 VSIX |
| `npm run test:vsix` | 对实际安装包运行同一宿主套件 |

宿主、UI 和 VSIX 检查共用 `scripts/run-vscode.cjs`。测试位于 `tests/unit/`、`tests/integration/` 和 `tests/vscode/`，Git 夹具统一放在 `tests/gitFixture.ts`。旧单 Cell 自动测试和重复的自动探针流程已移除，相关交互统一由 UI 测试验收。

F5 选择 `Jupyter Notebook Git Marks` 调试产品，或选择 `Native Notebook decoration probe` 手动运行独立渲染探针。演示文件为 `demo/demo.ipynb`。宿主和 UI 测试自动创建临时 Git 仓库及独立 VS Code 用户目录，不修改日常配置。Linux 无显示环境需要 Xvfb，Openbox 用于提供窗口焦点。首次运行默认下载 manifest 声明的最低 VS Code 版本，当前为 1.130.0。可通过 `VSCODE_VERSION=stable` 检查当前稳定版，或用 `VSCODE_EXECUTABLE` 指定已有的可执行文件。缓存版本不匹配时不会直接复用。

UI 测试通过真实键盘输入修改源码，调用 VS Code 原生 Undo 和 Notebook reveal 命令进行撤销与滚动，使用测试专用 kernel 产生输出。真实截图和渲染节点检查保存在 `output/playwright/product/`，性能测量在 `output/performance.json`。这些测试工具和产物不进入 VSIX。



## 发布到 Marketplace


本项目的 publisher 为 `StevenYang0316-5274`，扩展名为 `notebook-git-gutter`。在 [Marketplace 管理页](https://marketplace.visualstudio.com/manage) 登录拥有该 publisher 发布权限的 Microsoft 账户。

运行 `npm run package` 和 `npm run test:vsix`，随后在管理页选择 `New extension → Visual Studio Code`，上传新生成的 VSIX。包名自动采用 manifest 的名称和版本。更新已发布扩展时，先执行 `npm version patch --no-git-tag-version`，再打包、验证并上传新版本。

命令行发布已有包可使用 `npx --no-install vsce publish --packagePath ./notebook-git-gutter-0.1.3.vsix`，认证方式见 [官方发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。这条命令会上传到市场，本项目的构建和测试脚本不会执行发布。`package.json` 已填写公开源码仓库，打包时会把文档的相对链接改写为该仓库 `main` 分支的链接。
