# 思源数据库 Api 之增删改查实践总结

:::tip[]  
原文链接：https://ld246.com/article/1759122717311  
:::

### 缘起

最近做utools+思源数据库做网址收藏夹，实现了对数据库内容的增删改查操作，故总结一下。

注意，以下仅仅是个人使用经验的总结，并非最佳实践，可能还有更好的方法，请大佬们补充！

说明，由于思源的数据库操作API不够直观，很多新手可能看得一头雾水，因此这里尽量用简单的语言和实际应用的场景介绍，因此可能存在表达不够严谨的情况，方便理解即可，不必深究。

本文参考了 @Achuan-2  https://ld246.com/article/1733365731025 的文章。

### 新增数据行

新增数据行有两种方法：

1 如果添加非绑定块的行可用 /api/av/appendAttributeViewDetachedBlocksWithValue

使用方法参考：https://ld246.com/article/1733365731025#%E6%95%B0%E6%8D%AE%E5%BA%93%E6%B7%BB%E5%8A%A0%E7%BB%91%E5%AE%9A%E5%9D%97-api-av-addAttributeViewBlocks

2 如果添加的是绑定块的行可以用 /api/av/addAttributeViewBlocks

使用方法参考：https://ld246.com/article/1733365731025#%E6%95%B0%E6%8D%AE%E5%BA%93%E6%B7%BB%E5%8A%A0%E7%BB%91%E5%AE%9A%E5%9D%97-api-av-addAttributeViewBlocks

原理：先添加绑定块，再用`/api/av/setAttributeViewBlockAttr`设置具体的每个列数据，不过，思源新版本提供了批量修改列数据的方法 /api/av/batchSetAttributeViewBlockAttrs，使用方法 https://github.com/siyuan-note/siyuan/issues/15310#issuecomment-3079412833 ，这样就完美实现了添加新行且带绑定块。

### 修改数据行

可以用 `/api/av/setAttributeViewBlockAttr`

参考 https://ld246.com/article/1733365731025#%E6%95%B0%E6%8D%AE%E5%BA%93%E8%AE%BE%E7%BD%AE%E5%B1%9E%E6%80%A7-api-av-setAttributeViewBlockAttr

批量修改列数据的方法 /api/av/batchSetAttributeViewBlockAttrs，使用方法 https://github.com/siyuan-note/siyuan/issues/15310#issuecomment-3079412833

注意：这个接口变更计划，2026 年 6 月 30 日后 请求参数rowID将被弃用， 改为 itemID（即目前二者同时可用），see https://github.com/siyuan-note/siyuan/issues/15310#issuecomment-3239696237

### 查询数据

可用 `/api/av/renderAttributeView`

query参数传查询关键词即可，如果你查询的结果是唯一的，pageSize可设为1，加viewID参数可查询指定视图，默认是当前视图。

比如

```js
const data = await requestApi('/api/av/renderAttributeView', {
    "id": avId,
    "query": "",
    "pageSize": 50,
});
```

### 查询指定列

目前没发现一步到位的方法，不过可以同查询后用列名或列id过滤实现。

### 获取行数据

可通过`/api/av/renderAttributeView`查询和解析实现

比如

```js
// 同时支持表格row.cells和卡片row.values和分组groups.rows
async function getRowByLink(link) {
  const data = await requestApi('/api/av/renderAttributeView', {
    "id": config.avId,
    "query": link,
    "pageSize": 1,
  });
  if (!(data?.data?.view?.rowCount || data?.data?.view?.cardCount)) return [];
  const rowFiled = data?.data?.viewType === 'gallery' ? 'cards' : 'rows';
  const columns = data?.data?.viewType === 'gallery' ? 'fields' : 'columns';
  // 取查询到的第一条数据
  let rows = data.data.view[rowFiled];
  // 获取分组数据
  if(data.data.view.group) {
    const newRows = [];
    for(const group of data.data.view.groups) {
      if(group.rows.length) newRows.push(...group.rows);
    }
    rows = newRows;
  }
  // 获取指定列行数据，这里是link列
  const cols = data.data.view[columns];
  const colName = colsMaps.link;
  const colId = cols.find(c => c.name === colName)?.id;
  const row = rows.find(r => (r.cells||r.values).find(c => c.value.keyID === colId));
  if(!row) return [];
  // 只保留需要的列
  const colNames = Object.values(colsMaps);
  const colIds = cols.filter(c => colNames.includes(c.name)).map(c => c.id);
  row.cells = (row.cells||row.values).filter(c => colIds.includes(c.value.keyID));
  const colIdNameMap = {};
  cols.forEach(c => colIdNameMap[c.id] = c.name);
  row.cells.forEach(c => c.name = colIdNameMap[c.value.keyID]);
  return row;
}
```

### 判断数据是否已存在

方法同上，使用 /api/av/renderAttributeView即可，只需把关键词用唯一值和pageSize设为1即可。

比如

```js
async function isExistLink(link) {
  const data = await requestApi('/api/av/renderAttributeView', {
    "id": config.avId,
    "query": link,
    "pageSize": 1,
  });
  return (data?.data?.view?.rowCount || data?.data?.view?.cardCount) > 0;
}
```

### 删除数据行

删除行，直接用 `/api/av/removeAttributeViewBlocks`即可，可批量删除

比如，

```js
const result  = await requestApi("/api/av/removeAttributeViewBlocks", {
  "avID": avId,
  "srcIDs": [
    'rowId',
    'rowId',
  ]
});
```

### 获取数据库列表

avId和数据库名列表

```js
function getAvsByAvIds(avIds) {
  const ids = Array.isArray(avIds) ? avIds : avIds.split(/[,，]/).map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) return [];
  const subQueries = ids.map(avId => `
    SELECT
      SUBSTR(TRIM(content), 1, INSTR(TRIM(content) || ' ', ' ') - 1) AS name,
      '${avId}' AS id
    FROM blocks
    WHERE markdown LIKE '%data-av-id="${avId}"%'
  `);
  const sql = subQueries.join(' UNION ALL ');
  const result = querySql(sql);
  return result;
}
```

### 获取标签列表

```js
async function getAllTags(avId) {
  const resp = await requestApi('/api/av/renderAttributeView', {
    "id": avId,
    "query": "",
    "pageSize": 1,
  });
  if (!resp.data) return [];
  const columns = resp.data.viewType === 'gallery' ? 'fields' : 'columns';
  if (!resp || !resp.data || !resp.data.view || !Array.isArray(resp.data.view[columns])) return [];
  const col = resp.data.view[columns].find(c => c.type === 'mSelect' && c.name === colsMaps.tags);
  if (!col) return [];
  if (!Array.isArray(col.options)) return [];
  return col.options.map(opt => opt && opt.name).filter(Boolean);
}
```

### 其他说明

**如何获取rowID（新版统一改成ItemID）和keyID（列ID）？**

获取列ID可用api `/api/av/getAttributeViewKeysByAvID` 参考 https://ld246.com/article/1733365731025#%E8%8E%B7%E5%8F%96%E6%95%B0%E6%8D%AE%E5%BA%93%E7%9A%84%E6%89%80%E6%9C%89key-%E5%88%97id--api-av-getAttributeViewKeysByAvID

rowID的获取可以通过对`/api/av/renderAttributeView`结果的解析和存储实现，新版也提供了块id和rowID的转换 /api/av/getAttributeViewBoundBlockIDsByItemIDs 和 /api/av/getAttributeViewItemIDsByBoundIDs

**新版之坑：**

新版加了卡片和分组功能，这个api有变化，即当前为卡片视图时，如果未指定视图的情况下，返回的结果数据是， data.view.cards、data.view.fields、data.view.cards.values，而在表格视图时是 data.view.rows、data.view.columns、data.view.rows.cells，当有分组时，rows数据被分散到data.view.groups里，需要遍历后对groups[n].rows的数据进行拼接。（本示例中的代码已对上述情况做了兼容）。

**注意**

**本代码中的部分变量在外部定义的，并不能直接利用，仅仅提供思路和参考**，可根据需要修改后使用。

感谢 @hqweay 佬的提醒！
