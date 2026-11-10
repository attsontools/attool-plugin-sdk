# Review Profile

## 业务域

- 项目名称：`@attson/plugin-sdk`（仓库 `attool-plugin-sdk`）
- 项目定位：定义 AT Tool 可插拔应用的 Manifest、Catalog、信任元数据、签名和浏览器 Host API 公共契约。
- 主要调用方：AT Tool 桌面宿主、独立应用仓库的构建与发布流程、运行在宿主内的插件前端。
- 核心业务对象：Plugin Manifest、Catalog、Catalog Root、发布者与签名密钥、平台制品、Host RPC 消息。
- 关键状态流转：Catalog 元数据 sequence 只能前进；签名密钥按 `active -> retired/revoked` 参与签名与验签；Host RPC 请求经历 pending、完成、取消、超时或会话关闭。

## 关键约定

- Manifest、Root 和 Catalog 都是不可信输入，必须先经对应 parser 严格验证，禁止绕过验证后直接断言为公开类型。
- schema v1 对根对象和嵌套对象执行字段白名单；未知字段、未知权限、未知目标平台必须显式失败，禁止静默忽略或修正。
- `canonicalJson` 的输出是 Ed25519 签名字节契约。对象键必须递归按字典序排序，数组顺序保持不变，任何变更必须同步固定 canonical/signature fixture。
- 只允许 Ed25519；Catalog 新签名仅允许有效期内的 `active` key，历史验签可接受有效期内的 `active` 或 `retired` key，`revoked` key 永不接受。
- Root 与 Catalog 的 sequence 必须为正安全整数；调用方保存的最高已接受 sequence 不得被更小值覆盖。
- Catalog 制品必须使用 HTTPS、精确 SHA-256、正整数大小，且单个 release 的同一 OS/arch 最多一个制品。
- `appId`、publisher、publisher key、Catalog signing key 和目标平台的关联属于信任边界；修改相关字段或校验时必须证明不会发生跨应用或跨发布者替换。
- Manifest 与 Catalog 的权限集合、Host API 版本范围、OS/arch 枚举必须保持一致；新增值需要同步宿主实现和相关应用仓库。
- 浏览器 RPC 必须同时校验 JSON-RPC 版本、Host API 版本和 `appId`；握手必须返回非空 session/correlation identity，关闭、取消和超时必须清理 pending 请求。
- `src/index.ts`、`src/browser.ts`、`src/node.ts` 是不同运行时入口；浏览器可达入口不得引入 `node:*` API。
- `ManifestValidationError.code`、`CatalogValidationError.code` 和 `HostRpcError.code` 是调用方可判断的稳定契约，不得用模糊成功、空值或无分类异常替代明确失败。

## 高风险路径

- `src/canonical.ts`：决定所有签名数据的确定性字节表示。
- `src/catalog.ts`：Root/Catalog 信任模型、密钥生命周期、时效、sequence 和制品选择。
- `src/index.ts`：Manifest 公共契约、文件路径与哈希、权限和 Host API 兼容范围。
- `src/node.ts`：私钥签名与公钥验签边界，只能存在于 Node 入口。
- `src/browser.ts`：插件到宿主的消息信任边界、消息大小、请求生命周期和会话身份。
- `package.json#exports`：运行时隔离和所有调用方的公共导入路径。

## 忽略路径

- 无默认忽略路径。测试 fixture 参与证明签名字节和公共契约，不能作为普通生成文件跳过。

## 独立发布范围

无独立发布范围；三个导出入口属于同一个 SDK 版本。

## 领域术语

- Root：Catalog 信任根元数据，声明 Catalog 签名密钥和各 publisher 的独立签名密钥，不等于 AT Tool 自更新公钥。
- Catalog：平台维护的应用索引及 stable release 元数据；制品本体由各应用仓库发布。
- Publisher Key：应用发布者用于签署应用包或发布元数据的密钥，不等于 Catalog Signing Key。
- Catalog Signing Key：受 Root 委派、用于签署 Catalog 的在线密钥，不等于离线 Root Key。
- canonical bytes：对已验证对象执行递归键排序后得到的 UTF-8 JSON 字节，是签名输入，不是普通展示 JSON。
- Host API：插件通过 MessagePort 调用 AT Tool 宿主能力的版本化 JSON-RPC 协议。

## 重点检查项

### 业务约束

- Root、Catalog 与 Key 的时间窗口必须严格递增；时间字符串必须是有效的 UTC ISO-8601，而不只是形状匹配。
- key ID、publisher ID、app ID 和 target 的唯一性必须在各自作用域内明确校验。
- Catalog 发布信息与应用 Manifest 在 app、publisher、version、target、permissions、Host API 和文件哈希上的一致性不能由显示名称代替。
- 制品缺失当前 target 时应明确返回未找到；不得自动选择其他 OS、arch、版本或发布者的包。

### 架构边界

- 通用类型与 parser 放在主入口，浏览器 RPC 放在 browser 入口，Node crypto 放在 node 入口。
- parser 负责从 `unknown` 建立可信类型；后续签名、选择或 RPC 逻辑不得重复使用更宽松的影子 schema。
- 公共常量应由单一来源导出；Manifest 与 Catalog 不应维护会漂移的权限或平台白名单副本。

### 数据与兼容性

- 对公开 interface、export、error code、canonical bytes、schema 字段或枚举的删除、改名、语义收窄均视为 breaking change。
- schema 扩展必须通过新 schema version 或明确兼容方案完成，不能让旧 parser 静默接受未知字段。
- sequence、size 和时间比较必须避免精度、归一化和无效日期问题；边界值要有测试。
- 签名验签必须覆盖内容篡改失败；Base64、公钥长度或格式校验不能只证明字符串外形。

### 外部依赖

- 只依赖 Node 标准库；引入运行时依赖需说明浏览器/Node 打包影响和供应链必要性。
- Catalog 制品 URL 指向外部发布系统，SDK 只建立元数据约束；下载方仍必须校验大小、SHA-256 和发布者签名。
- MessagePort 和 `window.parent` 是浏览器边界；连接事件的 source、appId、API version 和 port 缺一不可。

### 测试重点

- 每个 parser 至少覆盖有效对象、未知字段、错误 schema、重复 identity、边界时间、未知权限和非法目标。
- canonical JSON 或签名逻辑变更必须覆盖固定字符串、固定 Ed25519 signature 和篡改失败。
- key status 测试必须同时覆盖 active 签名、retired 历史验签、revoked 拒绝和有效期边界。
- Host RPC 变更必须覆盖错误映射、超时取消、AbortSignal、close 清理、错误 app/version 和超限消息。
- 新增公共字段或值时，必须增加跨 Manifest/Catalog/Host API 的一致性回归测试。

## 触发关键词检查

- `canonicalJson`、`JSON.stringify`：检查签名字节是否改变，是否仍递归排序且保持数组顺序。
- `as unknown as`、类型断言：检查此前是否已经对所有字段和值完成运行时验证。
- `active`、`retired`、`revoked`：检查签名与验签语义、有效期边界和撤销后的拒绝行为。
- `sequence`：检查单调性、持久化最高值的调用约束和 safe integer 边界。
- `permissions`、`hostApi`、`os`、`arch`：检查 Manifest、Catalog 和宿主实现是否同步。
- `postMessage`、`onmessage`、`MessagePort`：检查来源/身份/version 校验、消息上限和 pending 清理。
- `node:crypto`、`Buffer`：检查是否只从 Node 入口可达。

## Verification Evidence

```bash
pnpm test
```

- 运行条件：Node.js `>=22.6`，通过 Corepack 使用 `pnpm@10.29.3`；当前测试使用 Node 内置 test runner，不需要外部服务或密钥。
- 常见环境失败：低版本 Node 不支持 `--experimental-strip-types`；应先核对 `node --version`，不要把语法加载失败判成业务测试失败。
- 无法本地验证时需要的证据：CI 的完整测试输出，以及 canonical/signature 固定 fixture 的实际值；信任契约变更还需 AT Tool 与至少一个应用仓库的集成验证记录。

## Risk & Compatibility

- Breaking change 判断：公共导出、类型、错误码、schema、权限/平台枚举、签名字节或既有有效输入的接受语义发生不兼容变化。
- 迁移要求：Root/Catalog schema 或 sequence 语义变化必须给出旧元数据读取、最高 sequence 保留和密钥轮换方案。
- 发布影响：SDK 契约变化需先验证 AT Tool 宿主和应用打包方；信任元数据变化必须可回滚，但不得通过降低 sequence 接受旧元数据。
- 安全/权限：重点防止路径穿越、未知权限、跨 app/publisher 替换、撤销密钥继续验签、签名绕过、HTTP 制品和消息身份混淆。
- 性能/容量：Host RPC 有 1 MiB 默认消息上限；新增无界集合、递归深度或超大 metadata 处理时需评估 CPU/内存拒绝服务风险。

## 跨仓库联动

- Manifest、Host API、权限或平台枚举变化：同步 `attsontools/attool` 宿主实现和使用该能力的应用仓库。
- 应用包或 publisher 契约变化：同步 `attsontools/atcodec` 及后续独立应用的构建、签名和 Release 流程。
- Catalog/Root schema 或签名变化：同步 `attsontools/attool` 中的 Catalog 文件、客户端解析验签与发布流水线。

## Review Routing

- 默认 owner：`NEEDS_INPUT: 仓库中没有 CODEOWNERS 或负责人信息。`
- 需要额外评审的情况：canonical/signature、Root/Catalog schema、密钥状态/轮换、权限、Host API 或公共 exports 变化。
- 升级路径：`NEEDS_INPUT: 安全与发布信任链变更由谁最终批准。`
- 应 request changes 的情况：存在签名绕过、撤销 key 仍可用、sequence 回退、跨应用/发布者替换、路径穿越、浏览器入口引入 Node API，或公共契约无迁移地破坏兼容。
- 可接受残余风险：无已知可接受的信任绕过；测试覆盖缺口仅在不影响安全/兼容结论且有明确后续跟踪时接受。

## Verdict 调整

- 签名字节不确定、信任验证可绕过、撤销或防回滚语义失效时直接判为 Block。
- 公共契约 breaking change 未提供版本化迁移方案，或 Manifest/Catalog/宿主白名单发生漂移时至少判为 Needs attention；会导致已发布客户端错误接受或拒绝包时判为 Block。

## Code Pointers

- `src/index.ts`：Manifest schema、稳定错误码、权限、文件路径与 Host API 契约。
- `src/catalog.ts`：Root/Catalog schema、密钥状态、sequence、制品约束和目标选择。
- `src/canonical.ts`：Manifest、Root、Catalog 共用的 canonical JSON 实现。
- `src/node.ts`：Ed25519 签名和验签 API。
- `src/browser.ts`：浏览器 Host RPC 客户端、握手和请求生命周期。
- `test/*.test.ts`：公共契约、固定签名 fixture 和安全边界的可执行证据。
- `package.json`：运行时入口、Node 版本、包管理器和唯一验证命令。

## 维护规则

- 不要把单次 review finding 直接提升为长期规则；需要 owner 确认、项目文档、重复问题证据或已接受的设计决策。
- 当验证命令、目录结构、schema、错误码、权限、平台、密钥状态或跨仓库联动变化时同步更新本 profile。
- 不复制通用代码风格、命名偏好或泛泛最佳实践；通用流程保留在共享 code-review skill。
