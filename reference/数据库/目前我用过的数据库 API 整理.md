# 目前我用过的数据库 API 整理

:::info[]  
原文链接 https://ld246.com/article/1733365731025  
:::

### 数据库添加非绑定的块和属性值/api/av/appendAttributeViewDetachedBlocksWithValue

- avID：数据库id，非块id
- blocksValues list, 数据库要添加的行

  - blocksValues 是个二维数组，对应表格视图的行列
  - 参数中的值可以参考源码 kernel/av/value.go 中的 Value 结构体

    - keyID 是每一列的 id
    - block、text、mSelect，number 是列类别。注意单选select也是用mSelect

```js
avid = '20241017094451-2urncs9'
const input = {
  "avID": avid,
  "blocksValues": [
    [
      {
        "keyID": "20241017094451-jwfegvp",
        "block": {
          "content": "Test block2"
        }
      },
      {
        "keyID": "20241017094451-fu1pv7s",
        "mSelect": [{"content":"Fiction4"}]
  
      },
      {
        "keyID": "20241017095436-2wlgb7o",
        "number": {
          "content": 1234
        }
      }
    ]
  ]
}
const result =await fetchSyncPost('/api/av/appendAttributeViewDetachedBlocksWithValues', input)

```

### 数据库添加绑定块/api/av/addAttributeViewBlocks

- avID：数据库id，非数据库块id，可在DOM中找
- blockID：数据库块id，非添加的块id
- srcs

  - id：块id
  - isDetached

    - false：是绑定块
    - true：是非绑定块

```js
const docids = ['20240107212802-727hsjv'] // 文档id
const srcs = docids.map(docId => ({
    "id": docId,
    "isDetached": false,
}));
avid = '20241017094451-2urncs9'; // 数据库


const input = {
  "avID": avid,
  'srcs': srcs
  
}
const result =await fetchSyncPost('/api/av/addAttributeViewBlocks', input)  
```

### 数据库绑定块，同时添加属性

> 对于绑定块，rowID=docID

```js
avID = '20241017094451-2urncs9' // 数据库ID
keyID = '20241102151935-gypad0k' // 文本列ID
docId = '20211116001448-ny4lvyw' //文档ID
// ------------数据库绑定块  ------------ // 
const docids = [docId] // 文档id
const srcs = docids.map(docId => ({
    "id": docId,
    "isDetached": false,
}));

const input = {
  "avID": avID,
  'srcs': srcs
  
}
await fetchSyncPost('/api/av/addAttributeViewBlocks', input)  


// ------------设置属性 ------------ // 
await fetchSyncPost("/api/av/setAttributeViewBlockAttr", {
    avID: avID,
    keyID: keyID,
    rowID: docId,
    value: {
            "text": {
                "content": '📂Research\n📂Project\n📂Area\n📂Resources\n📂Life'
            }
        },
});
```

### 数据库设置属性/api/av/setAttributeViewBlockAttr

```js
// type: text
let res = await fetchSyncPost("/api/av/setAttributeViewBlockAttr", {
    avID: '20241017094451-2urncs9',
    keyID: '20241102151935-gypad0k',
    rowID: '20211116001448-ny4lvyw',
    value: {
            "text": {
                "content": 'hh\nhhh'
            }
        },
});

res
// type: number
let res = await fetchSyncPost("/api/av/setAttributeViewBlockAttr", {
    avID: '20241017094451-2urncs9',
    keyID: '20241017095436-2wlgb7o',
    rowID: '20240107212802-727hsjv',
    cellID: '20241102151045-ueb6zqn',
    value: {
            "number": {
                "content": 4,
                "isNotEmpty": true
            }
        },
});

res

// type: single select
let res = await fetchSyncPost("/api/av/setAttributeViewBlockAttr", {
    avID: '20241017094451-2urncs9',
    keyID: '20241017094451-fu1pv7s',
    rowID: '20241017094453-65uzx7e',
    cellID: '20241017094455-9mj9255',
    value: {
            "mSelect": 
              [{"content":"Fiction4"}]
  
        },
});

res

// type: multiple Select
let res = await fetchSyncPost("/api/av/setAttributeViewBlockAttr", {
    avID: '20241017094451-2urncs9',
    keyID: '20241017101851-kekovwz',
    rowID: '20241017094453-65uzx7e',
    cellID: '20241017102149-2jimfjh',
    value: {
            "mSelect": [{"content":"Fiction3"}]
        },
});

res
```

### 获取数据库的所有key（列id）/api/av/getAttributeViewKeysByAvID

```js
let res = await fetchSyncPost("/api/av/getAttributeViewKeysByAvID", {
   avID:  '20241017094451-2urncs9'
});

res
```

### 查询哪些数据库包含了这个块getAttributeViewKeys

```js
let res = await fetchSyncPost("/api/av/getAttributeViewKeys", {
   id:  '20211116001448-ny4lvyw'
});

res
```

### 已知rowID(docID)和keyid，如何获取cellID

```js
let res = await fetchSyncPost("/api/av/getAttributeViewKeys", {
   id:  '20211116001448-ny4lvyw'
});
const foundItem = res.data.find(item => item.avID === "20241017094451-2urncs9"); //avid
if (foundItem && foundItem.keyValues) {
    // 步骤2：在 keyValues 中查找特定 key.id 的项
    const specificKey = foundItem.keyValues.find(kv => kv.key.id === "20241102151935-gypad0k"); // keyid
  
    // 步骤3：获取 values 数组的第一个元素的 id
    if (specificKey && specificKey.values && specificKey.values.length > 0) {
        console.log(specificKey.values[0].id)
        //return specificKey.values[0].id;
    }
}

```
