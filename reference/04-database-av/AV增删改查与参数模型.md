# AV 增删改查与参数模型

- 适用版本：SiYuan `v3.5.7`
- 最后核对：2026-02-21
- 稳定性：stable（含迁移项）
- 权威来源：
  - <https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go>
  - <https://github.com/siyuan-note/siyuan/issues/15310#issuecomment-3079412833>
  - <https://github.com/siyuan-community/siyuan-developer-docs/tree/main>

## 1. AV 常用接口

- 查询视图：`/api/av/renderAttributeView`
- 添加绑定块：`/api/av/addAttributeViewBlocks`
- 添加非绑定块并带值：`/api/av/appendAttributeViewDetachedBlocksWithValues`
- 单项设置值：`/api/av/setAttributeViewBlockAttr`
- 批量设置值：`/api/av/batchSetAttributeViewBlockAttrs`
- 删除行：`/api/av/removeAttributeViewBlocks`

## 2. 新增行的两种路径

### A. 非绑定块（一次写值）

用 `appendAttributeViewDetachedBlocksWithValues`，适合直接录入结构化数据。

### B. 绑定块（推荐两段式）

1. `addAttributeViewBlocks` 绑定块
2. `batchSetAttributeViewBlockAttrs` 批量写列值

## 3. 查询模型

`renderAttributeView` 的返回结构会随视图类型变化（表格/看板/画廊），读取时建议统一适配：

- 优先识别 `viewType`
- 兼容 `rows`/`cards`/分组结构
- 列信息使用返回的 `columns` 或 `fields`

## 4. 批量写值示例

```json
{
  "avID": "20250716235026-51p7441",
  "values": [
    {
      "keyID": "20250716235026-njmx362",
      "rowID": "20250716235124-6qqlnpw",
      "value": { "block": { "content": "Test" } }
    }
  ]
}
```

注：`rowID` 将在后续版本迁移为 `itemID`，见下一篇。

## 5. 本章如何使用

- 做数据库 CRUD 功能时，先确定“绑定块/非绑定块”模式
- 新建多行多列时优先批量接口，减少请求次数
- 不同视图类型统一走解析适配层，不要把解析写死在业务里

