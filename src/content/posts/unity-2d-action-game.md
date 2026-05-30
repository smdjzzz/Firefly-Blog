---
title: 基于 Unity URP 的 2D 横版动作游戏——项目架构解析
published: 2026-05-30
description: 基于 Unity 2022.3 URP 开发的 2D 横版动作游戏，实现了完整的角色控制、战斗、AI、任务、背包、对话与存档系统。
tags: [Unity, C#, 游戏开发, 架构]
category: 技术分享
draft: false
---
## 项目概述

基于 Unity 2022.3 URP 的 2D 横版动作游戏，实现了完整的角色控制、战斗、AI、任务、背包、对话与存档系统。项目采用**管线式架构**驱动角色逐帧逻辑，通过 ScriptableObject 配置静态数据，遵循**构造器注入**、**职责分离**等设计原则，实现了高度模块化与可扩展的代码结构。

角色控制器基于此框架编写： [控制器源码](`https://github.com/bunkerboy258/BBB-Nexus`) / [B站教程](`https://www.bilibili.com/video/BV1X2XZBDEDq/`)

本源码地址：[石磨豆浆/2DAction](https://gitee.com/smdjzzz/2-daction)

---

## 一、核心架构：角色控制器

### 1.1 三大管线 + 数据黑板

整个控制器围绕 **数据黑板 RuntimeData** 展开，所有管线与状态机均通过黑板读写帧级运行时数据，避免直接耦合。

每帧的处理流水线如下：

```
Update:
  ① TimeManager 计算缩放时间
  ② ArbiterPipeLine     → 仲裁待处理的伤害/动作/交互请求
  ③ InputPipeLine       → 采集原始输入，维护按键缓冲计时
  ④ MainProcessorPipeLine → 输入→意图翻译 → 意图→参数计算
  ⑤ StateMachine.LogicUpdate → 当前状态逻辑（含打断检测）
  ⑥ 表现层更新（音频、残影等）

LateUpdate:
  ① StateMachine.PhysicsUpdate → 物理驱动（MotionDriver）
  ② HitBoxController  → 攻击判定（依赖 Animator 结算后的动画状态）
  ③ ArbiterPipeLine 后处理
  ④ RuntimeData.ResetIntents → 清理帧级意图标志
```

**Pipeline / Arbiter / Processor 均为纯 C# 类**，在 `SmdjCharacterController.Awake()` 中通过构造器注入依赖完成组装，不依赖 Unity 生命周期，便于单元测试与逻辑复用。

#### 1.1.1 RuntimeData —— 数据黑板

存放玩家的帧级输入意图（`WantToJump`、`WantToAttack` 等）、物理状态（`IsGrounded`、`IsDashing`、`FacingDirection` 等）、仲裁标志 `ArbitrationFlags`、伤害请求队列，以及当前帧的 `ScaledDeltaTime` 和 `EffectiveTimeScale`。帧级意图在 `LateUpdate` 末尾统一清零。

#### 1.1.2 InputPipeLine —— 输入管线

通过 `IInputSource` 接口抽象输入源（项目使用 Unity Input System），每帧获取原始按键状态（`RawInputData`，区分按下/按住），并根据 SO 中配置的边沿缓冲时间维护按键缓冲计时；同时对外暴露 `ConsumeXxxPressed()` API，供各 State 消费已缓冲的输入。

#### 1.1.3 MainProcessorPipeLine —— 意图翻译管线

采用**双阶段处理**架构：

- **IntentProcessor**：根据输入缓冲数据 + 仲裁标志，翻译为意图标志写入 RuntimeData（如 `JumpIntentProcessor` 判断地面/二段跳条件，设置 `WantToJump` 或 `WantToDoubleJump`）
- **ParameterProcessor**：完全基于 RuntimeData 的当前状态推导运动参数（如根据 `IsGrounded` 的前后帧变化推断起跳/落地）

#### 1.1.4 ArbiterPipeLine —— 仲裁管线

在 InputPipeLine 之前执行，设置仲裁标志决定当帧哪些行为被禁止。采用"总管 + 子仲裁器"架构：

- **ActionArbiter**：处理动作覆盖请求，执行状态切换
- **HealthArbiter**：处理伤害请求队列，角色死亡时禁止输入/攻击/移动，触发死亡状态
- **InteractArbiter**：处理交互请求

### 1.2 有限状态机 + 打断器

状态机采用经典的 `Enter / LogicUpdate / PhysicsUpdate / Exit` 四阶段模型，`StateMachine` 负责状态切换与生命周期管理。

**核心创新：打断器（Interceptor）机制**

`PlayerBaseState.LogicUpdate()` 被 `sealed` 修饰为模板方法，先遍历全局打断器检测，未命中才执行自身逻辑：

```
LogicUpdate (sealed)
  ├── CheckInterrupt()  → GlobalInterruptProcessor 遍历所有 Interceptor
  │   └── 命中 → ChangeState(newState) → return（跳过原状态逻辑）
  └── UpdateStateLogic()  → 执行当前状态的正常逻辑
```

子打断器继承 `StateInterceptorSO`（ScriptableObject），定义具体的打断条件与目标状态，按优先级注册到 `BrainSO` 中。此机制解决了多状态切换关系复杂时的耦合问题，新增状态过渡只需新增一个 Interceptor 而无需修改既有状态代码。

### 1.3 动画外观模式

通过 `IAnimationFacade` 接口抽象动画操作（播放、过渡、设置回调、获取归一化时间等），项目实现了对 Unity Animator 的外观封装 `AnimatorFacade`。State 通过 `AnimPlayOption` 结构体描述播放参数，调用 `IAnimationFacade.PlayClip(clip, option)` 驱动动画——动画系统与状态逻辑完全解耦，可随时替换底层动画方案。

### 1.4 MotionDriver —— 物理驱动分离

将角色物理运动逻辑从各 State 的 `PhysicsUpdate` 中抽离到独立的 `MotionDriver` 类中，实现 **State 专注状态处理，MotionDriver 专注物理驱动** 的职责分离。MotionDriver 基于 RuntimeData 中的运动意图与 SO 中的物理参数（重力、最大速度等）计算并施加刚体力。

---

## 二、战斗系统

### 2.1 攻击数据驱动

攻击行为通过 `AttackSO` / `AttackAnimData` 配置，包含：

- 攻击动画 Clip
- 运动曲线（AnimationCurve）——用于定义攻击过程中的强制位移（如"后撤步再突刺"），通过归一化时间采样，由 MotionDriver 驱动
- 连击窗口时间
- 攻击预制体类型（通过枚举 + SO 预制体工厂映射获取）
- 技能冷却时间

AttackState 中根据攻击数据执行：动画播放 → 运动曲线驱动位移 → 攻击预制体生成 → 连击窗口判定。

### 2.2 伤害系统

- **IDamageable** 接口：定义可受击物体的行为（是否可被伤害、接收伤害请求）
- **DamageSO**（策略模式）：传入伤害数据与目标对象，执行具体伤害逻辑。项目实现了 `SimpleDamageSO`（直接伤害）和 `KnockbackDamageSO`（含击退）
- **IAttackableItem**：攻击手段的抽象，持有 DamageSO 策略，通过 Collider 检测 IDamageable 并应用伤害。项目实现了区域伤害（地刺）、近战伤害、投射伤害三种类型
- **伤害请求队列**：玩家与敌人均使用队列存储同帧内的多个伤害请求，避免多段伤害同帧命中的数据竞争

### 2.3 敌人 AI

敌人采用与玩家角色**镜像架构**——同样拥有 RuntimeData、状态机、MotionDriver、SO 配置系统，复用相同的设计模式。

**行为流程**：

```
巡逻(Patrol) → 检测到玩家进入视野 → 追击(Chase)
  → 进入攻击距离 → 攻击前摇 → 攻击(Attack)
  → 追击超时/丢失玩家 → 等待(Idle) → 返回(Return) / 巡逻(Patrol)
  → 死亡(Dead)
```

**关键组件**：

- `EnemyDetectionZone`：通过 Collider 划定敌人视野范围，玩家进出时更新 RuntimeData 中的目标记录
- `PatrolArea`：定义巡逻边界，巡逻状态下优先检查追击条件，再检查边界
- `EnemyAttackState`：增加攻击前摇阶段，前摇结束后执行实际攻击判定
- `EnemySkillState`：技能状态，支持类似玩家的技能释放逻辑

---

## 三、时间管理模块

`TimeManager` 提供多通道时间缩放能力，支持帧冻结、子弹时间、暂停，以及按对象分组的独立时间层。

**全局时间缩放** = 帧冻结系数 × 子弹时间系数 × 暂停系数 × Debug 系数，每个子系数独立设置，同步更新全局缩放。

**时间层（TimeLayer）**：每个 TimeLayer 拥有独立的 `LayerTimeScale`，与全局系数相乘得到层有效时间系数。所有受时间管理影响的 Mono 继承 `TimeLayerableBase`，注册到对应时间层，每帧接收 `ScaledDeltaTime`。

**设计考量**：动画、物理运动、前摇计时使用时间管理器的时间（受时缓影响），而受击无敌间隔使用 `UnscaledDeltaTime`，确保时缓下敌人的受击间隔不变，实际 DPS 不受影响。项目中实际应用了玩家对敌人层施加的时缓技能。

---

## 四、任务系统

`QuestManager` 作为纯 C# 单例，管理任务从接取 → 推进 → 完成/待交的完整生命周期。通过 `EventCenter` 驱动进度更新，配合 `QuestPanel` 实现 UI 呈现。

**数据流**：

```
游戏行为 → 广播 EventCenter 事件
  → QuestManager.OnObjectiveEvent() 回调
  → QuestInstance.UpdateProgress()
  → QuestObjectiveInstance.AddProgress()
  → 广播 QuestObjectiveUpdated 事件
  → UI 更新
  → 全部目标完成 → 根据 needConfirmToComplete 策略决定待交NPC确认或自动完成
  → 广播 QuestCompleted 事件
```

**配置层**：`QuestSO` + `QuestObjective` 定义任务配置，运行时构造为 `QuestInstance` + `QuestObjectiveInstance`，通过闭包注册事件监听器来推进任务进度。

---

## 五、交互与对话系统

### 5.1 交互模块

基于 `IInteractable` + `IInteractTrigger` 接口设计：

- `IInteractTrigger` 持有 `IInteractable`，触发后调用 `Interact()`
- 项目中实现了 `AutoTimesColliderTrigger`（进出范围自动控制触发锁）
- Interactable 实现了持续性交互（长按）、掉落物拾取、宝箱开启等多种类型

### 5.2 分支对话系统

- `DialogueDataSO` 存储对话数据，`DialogueSegment` 包含对话内容与分支选项 `BranchOption`
- `BranchOption` 定义分支进入条件、目标对话、是否可选（`ButtonText` 非空则显示选项按钮）
- 对话中通过 `QuestAction` 标志触发任务的接取/完成
- `ConversationManager` 管理对话的开启/推进/结束与分支选择
- 文字显示采用策略模式，支持打字机效果（`TypewriterStrategy`）与即时显示（`InstantStrategy`）

---

## 六、背包系统

- `ItemSO` 配置物品数据：名称、图标、类型、最大堆叠数量、使用效果等
- `ItemSlot` 为背包槽位，持有 `ItemSO` 与数量
- `InventoryManager` 管理 `ItemSlot` 列表，提供增删改查 API，通过 `EventCenter` 广播物品变动事件（增减、使用），实现 UI 与数据的松耦合
- 宝箱、掉落物通过 `DropEntry` 配置掉落表，静态工厂方法生成 `ItemPickup`，拾取时调用 `InventoryManager` 完成物品添加

---

## 七、JSON 存档系统

存档系统通过 `SaveManager` 统一调度，覆盖两类数据：

- **管理器数据**（任务、背包等）：各管理器自行实现 `Save/Load` 方法，由 `SaveManager` 统一调用
- **场景对象**（怪物、宝箱、门、掉落物等）：继承 `ISaveable` 接口，实现 `CaptureState()` / `RestoreState()`。数据包括：是否死亡/开启/拾取、血量、位置等。SaveManager 通过 `FindObjectsOfType` 收集场景中所有 ISaveable 并序列化为 JSON

---

## 技术要点总结

| 设计模式/技术                   | 应用场景                                                             |
| ------------------------------- | -------------------------------------------------------------------- |
| **管线模式**              | InputPipeLine → MainProcessorPipeLine → ArbiterPipeLine 三级流水线 |
| **黑板模式**              | RuntimeData 作为全局数据共享中心                                     |
| **状态模式 + 模板方法**   | 有限状态机 + sealed LogicUpdate + 打断器机制                         |
| **策略模式**              | DamageSO 伤害策略、ITextDisplayStrategy 文字显示策略                 |
| **外观模式**              | IAnimationFacade 抽象动画系统                                        |
| **观察者模式**            | EventCenter 事件总线驱动任务、UI、背包等模块通信                     |
| **对象池**                | IPoolable 接口，支持角色复用的对象池系统                             |
| **ScriptableObject 配置** | 所有静态数据通过 SO 配置，实现数据与逻辑分离                         |
| **构造器注入**            | 所有依赖通过构造函数传递，无 Service Locator，便于测试               |

**技术栈**：Unity 2022.3 · URP · C# · Unity Input System · Cinemachine 2.x · TextMeshPro
