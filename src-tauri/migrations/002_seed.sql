-- 种子数据（幂等）。徽章 condition 只使用 {"all":[{"gte":[metric, n]}]} 结构（docs/02 §6.5）。
-- 可用指标：run_count / total_seconds / streak_days / reviews_count
-- icon 存 lucide 图标名，前端 src/lib/badgeIcons.tsx 负责映射
INSERT OR IGNORE INTO badges (code, name, description, icon, tier, reward_coin, condition) VALUES
  -- 次数线
  ('first_run',      '第一步',     '完成第一个任务',        'flag',          'bronze', 10,  '{"all":[{"gte":["run_count",1]}]}'),
  ('run_five',       '五次',       '累计完成 5 个任务',     'sparkles',      'bronze', 20,  '{"all":[{"gte":["run_count",5]}]}'),
  ('run_ten',        '十次点火',   '累计完成 10 个任务',    'zap',           'bronze', 30,  '{"all":[{"gte":["run_count",10]}]}'),
  ('run_twenty_five','二十五次',   '累计完成 25 个任务',    'rocket',        'silver', 60,  '{"all":[{"gte":["run_count",25]}]}'),
  ('run_fifty',      '五十次',     '累计完成 50 个任务',    'layers',        'silver', 80,  '{"all":[{"gte":["run_count",50]}]}'),
  ('run_hundred',    '一百次',     '累计完成 100 个任务',   'trophy',        'gold',   200, '{"all":[{"gte":["run_count",100]}]}'),
  -- 时长线
  ('hour_one',       '第一小时',   '累计专注满 1 小时',     'clock',         'bronze', 20,  '{"all":[{"gte":["total_seconds",3600]}]}'),
  ('hour_five',      '五小时',     '累计专注满 5 小时',     'sun',           'bronze', 40,  '{"all":[{"gte":["total_seconds",18000]}]}'),
  ('hour_ten',       '十小时',     '累计专注满 10 小时',    'timer',         'silver', 60,  '{"all":[{"gte":["total_seconds",36000]}]}'),
  ('hour_fifty',     '五十小时',   '累计专注满 50 小时',    'moon',          'silver', 150, '{"all":[{"gte":["total_seconds",180000]}]}'),
  ('hundred_hours',  '一百小时',   '累计专注满 100 小时',   'hourglass',     'gold',   300, '{"all":[{"gte":["total_seconds",360000]}]}'),
  -- 连续线
  ('streak_three',   '三日不断',   '连续 3 天有专注记录',   'flame',         'bronze', 30,  '{"all":[{"gte":["streak_days",3]}]}'),
  ('week_streak',    '七日不断',   '连续 7 天有专注记录',   'calendar-check','silver', 80,  '{"all":[{"gte":["streak_days",7]}]}'),
  ('streak_fourteen','两周不断',   '连续 14 天有专注记录',  'calendar-days', 'silver', 120, '{"all":[{"gte":["streak_days",14]}]}'),
  ('month_streak',   '三十日',     '连续 30 天有专注记录',  'medal',         'gold',   400, '{"all":[{"gte":["streak_days",30]}]}'),
  ('streak_hundred', '百日',       '连续 100 天有专注记录', 'crown',         'gold',   800, '{"all":[{"gte":["streak_days",100]}]}'),
  -- 复盘线
  ('review_first',   '第一次复盘', '写完第一篇复盘',        'notebook-pen',  'bronze', 20,  '{"all":[{"gte":["reviews_count",1]}]}'),
  ('review_five',    '复盘五篇',   '累计写完 5 篇复盘',     'pen-line',      'bronze', 50,  '{"all":[{"gte":["reviews_count",5]}]}'),
  ('review_ten',     '复盘十篇',   '累计写完 10 篇复盘',    'book-open-check','silver', 80, '{"all":[{"gte":["reviews_count",10]}]}'),
  ('review_thirty',  '复盘三十篇', '累计写完 30 篇复盘',    'library',       'gold',   260, '{"all":[{"gte":["reviews_count",30]}]}');

-- 老版本留下的徽章：图标/文案按新目录刷新（code 不变，已解锁状态保留）
UPDATE badges SET icon = 'flag',           description = '完成第一个任务'      WHERE code = 'first_run';
UPDATE badges SET icon = 'calendar-check', description = '连续 7 天有专注记录', name = '七日不断' WHERE code = 'week_streak';
UPDATE badges SET icon = 'hourglass',      description = '累计专注满 100 小时'  WHERE code = 'hundred_hours';
UPDATE badges SET icon = 'book-open-check',description = '累计写完 10 篇复盘', name = '复盘十篇' WHERE code = 'review_ten';

INSERT OR IGNORE INTO decorations (id, name, kind, price, asset) VALUES
  ('sticker-star',  '小星星',     'sticker', 20,  'sticker-star'),
  ('sticker-leaf',  '一片叶子',   'sticker', 20,  'sticker-leaf'),
  ('frame-thin',    '细描边框',   'frame',   60,  'frame-thin'),
  ('bg-grid',       '网格底纹',   'bg',      120, 'bg-grid');

-- 默认 TaskLine：时间轴需要一个可用的看板
INSERT OR IGNORE INTO tasklines (id, name, start_hour, end_hour, sort_index, created_at)
VALUES ('tl-default', '默认 TaskLine', 6, 24, 0, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- scheduled 触发查询用的索引（last_fired_at 列由 db.rs 幂等补建，见 ensure_column）
CREATE INDEX IF NOT EXISTS idx_tasks_sched ON tasks(duration_mode, scheduled_at) WHERE duration_mode = 'scheduled';
