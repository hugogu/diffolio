# Fix: GET /api/v1/comparisons/:id/alignments 接口

## 问题
接口 `/api/v1/comparisons/:id/alignments` 之前是占位实现，只返回空数组 `{ items: [], total: 0 }`，没有实际查询数据库。

## 修复内容

### 文件: `backend/src/routes/comparisons.ts`

实现了完整的对齐结果查询功能：

1. **分页支持**: `page` 和 `pageSize` 参数
2. **词头过滤**: `headword` 参数支持模糊搜索 entryA 和 entryB 的词头
3. **变更类型过滤**: `changeType` 参数支持多类型过滤（逗号分隔）
4. **义位变更类型过滤**: `senseChangeType` 参数
5. **完整数据加载**: 包含 entryA、entryB 及其 senses、examples，以及 senseDiffs

### 关键技术点

**Prisma 查询语法** - 对于可能为 null 的关系字段（entryA/entryB），使用 `is:` 语法：
```typescript
where.AND.push({
  OR: [
    { entryA: { is: { rawHeadword: { contains: searchTerm } } } },
    { entryB: { is: { rawHeadword: { contains: searchTerm } } } },
  ],
})
```

这正确处理了 ADDED/DELETED 类型对齐中 entryA 或 entryB 为 null 的情况。

## 测试验证

### 1. 本地验证结果
```bash
# 无过滤
GET /api/v1/comparisons/13e865a5-4d07-4ef1-859c-8c78484921af/alignments?page=1&pageSize=3
→ Total: 70285

# 词头过滤（"阿"）
GET .../alignments?headword=%E9%98%BF
→ Total: 33

# 变更类型过滤
GET .../alignments?changeType=MATCHED
→ Total: 63323
```

### 2. 响应结构
```json
{
  "items": [...],
  "total": 70285,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3515
}
```

每个 alignment 包含：
- id, comparisonId, changeType, alignScore
- entryA/entryB（含 senses → examples）
- senseDiffs

### 3. 类型检查
- comparisons.ts: ✅ 无错误
- 项目现有错误与本次修改无关

## 测试文件
`backend/tests/verify-alignments.js` - 集成测试脚本，验证：
- 基本计数
- 词头过滤
- 变更类型过滤
- 分页和关联数据加载
- 响应结构验证

运行方式：
```bash
docker exec doc-compare-api-1 node tests/verify-alignments.js
```
