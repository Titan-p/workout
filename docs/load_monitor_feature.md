# Load Monitor 功能设计

## 目标

`Load Monitor` 把训练记录扩展成可持续观察的负荷面板，当前交付范围覆盖三块：

- 训练结束时写入 `session RPE × Duration`
- 每日保存 `体重 / 疲劳 / 疼痛 / 备注`
- 周视图展示 `day load / week load / chronic load / ACWR`

`潘律训练计划.xlsx` 里的 `Load Monitor` sheet 继续作为口径参考，当前实现范围聚焦在 schema、接口和页面。

## 数据口径

### Session 级

- `session_rpe`: 整次训练主观强度
- `duration_minutes`: 整次训练时长
- `session_load = session_rpe × duration_minutes`
- `session_slot`: `morning | afternoon | evening | extra`

### Day 级

- `day_total_load = sum(session_load)`
- `body_weight_kg`
- `fatigue_score`
- `pain_score`
- `daily_note`

### Week 级

- `week_total_load = sum(day_total_load)`
- `avg_daily_load = week_total_load / 7`
- `daily_load_stddev = stddev_pop(7 daily totals)`
- `chronic_load_4w = avg(last 4 week_total_load including current)`
- `chronic_load_prev3w = avg(previous 3 week_total_load)`
- `acwr_coupled = week_total_load / chronic_load_4w`
- `acwr_uncoupled = week_total_load / chronic_load_prev3w`

### 颜色区间

延续 sheet 里的负荷分段：

- `0~200`
- `200~400`
- `400~600`
- `600~800`
- `800~1000`
- `1000+`

## 数据模型

### `training_sessions`

在原有训练会话表上扩展：

- `session_name`
- `session_slot`
- `session_rpe`
- `duration_minutes`
- `session_load`

### `training_day_metrics`

新增自然日维度表：

- `date`
- `body_weight_kg`
- `fatigue_score`
- `pain_score`
- `daily_note`
- `metadata`

## API

### `POST /api/finish-training`

新增负荷相关字段：

```json
{
  "session_id": "uuid",
  "notes": "今天整体节奏稳定",
  "session_name": "力量房",
  "session_slot": "evening",
  "session_rpe": 6.5,
  "duration_minutes": 70,
  "body_weight_kg": 76.4,
  "fatigue_score": 5,
  "pain_score": 1,
  "daily_note": "右膝轻微紧张"
}
```

服务端行为：

- 更新 `training_sessions`
- upsert `training_day_metrics`
- 返回 `session_load` 和最新 day metric

### `GET /api/load-monitor`

输入：

- `date`
- `week`

输出：

- 当前周 7 天负荷卡片
- 周汇总
- 近 8 周趋势

### `GET /api/load-monitor/day`

输入：

- `date`

输出：

- 当日已完成 session 列表
- 当日体重 / 疲劳 / 疼痛 / 备注

## 页面

### 训练页

结束训练区域新增：

- 主项目
- 训练时段
- Session RPE
- 训练时长
- 体重
- 疲劳评分
- 疼痛评分
- 当日备注
- 训练总结

### 负荷页

新增 `负荷管理` tab，展示：

- 本周总负荷
- 平均单日负荷
- 负荷标准差
- 4 周 Chronic Load
- 耦合 / 非耦合 ACWR
- 每日 session 列表和日备注
- 近 8 周周总负荷趋势

## Schema 执行

本次数据库变更集中在 [docs/training_schema.sql](/Users/panlyu/Developer/workout_web/docs/training_schema.sql)。

执行目标：

- 为 `training_sessions` 补齐负荷字段
- 新建 `training_day_metrics`
- 增加查询索引
- 为两张表保持 `updated_at`

## 当前范围

当前仓库里 `Load Monitor` 功能覆盖：

- schema 变更
- API
- 页面
- 测试

## 后续切片

- 历史 Excel 导入
- 导入幂等和批次管理
