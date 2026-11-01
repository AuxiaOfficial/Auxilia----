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

-- 老的四件装饰（价格后来调过，这里同步，避免老库还是旧价）
UPDATE decorations SET price = 3,   name = '小星星',   asset = 'star'        WHERE id = 'sticker-star';
UPDATE decorations SET price = 3,   name = '一片叶子', asset = 'leaf'        WHERE id = 'sticker-leaf';
UPDATE decorations SET price = 8,   name = '细描边框', asset = 'frame-thin'  WHERE id = 'frame-thin';
UPDATE decorations SET price = 30,  name = '网格底纹', asset = 'grid'        WHERE id = 'bg-grid';

-- 老版本留下的徽章：图标/文案按新目录刷新（code 不变，已解锁状态保留）
UPDATE badges SET icon = 'flag',           description = '完成第一个任务'      WHERE code = 'first_run';
UPDATE badges SET icon = 'calendar-check', description = '连续 7 天有专注记录', name = '七日不断' WHERE code = 'week_streak';
UPDATE badges SET icon = 'hourglass',      description = '累计专注满 100 小时'  WHERE code = 'hundred_hours';
UPDATE badges SET icon = 'book-open-check',description = '累计写完 10 篇复盘', name = '复盘十篇' WHERE code = 'review_ten';

-- 装置目录（增量线）：只在专注时段产币
CREATE TABLE IF NOT EXISTS devices (
  kind           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  hint           TEXT NOT NULL,
  unlock_seconds INTEGER NOT NULL DEFAULT 0,
  base_price     INTEGER NOT NULL,
  growth         REAL NOT NULL DEFAULT 1.18,
  cap            INTEGER NOT NULL DEFAULT 20
);
INSERT OR REPLACE INTO devices (kind, name, hint, unlock_seconds, base_price, growth, cap) VALUES
  ('book', '书',   '+6 coin / 小时',   0,    6,  1.15, 20),
  ('lamp', '台灯', '+30 coin / 小时',  7200, 90, 1.18, 12);

-- 装饰目录（只作用于装饰墙，用「心流币」购买，永不贬值）
INSERT OR IGNORE INTO decorations (id, name, kind, price, asset) VALUES
  ('sticker-star',     '小星星',       'sticker',     3,    'star'),
  ('sticker-leaf',     '一片叶子',     'sticker',     3,    'leaf'),
  ('frame-thin',       '细描边框',     'frame',       8,    'frame-thin'),
  ('plaque-first',     '第一块铭牌',   'plaque',      10,   'plaque-1'),
  ('bg-grid',          '网格底纹',     'bg',          30,   'grid'),
  ('sticker-moon',     '一半月光',     'sticker',     40,   'moon'),
  ('shelf-wood',       '木质层架',     'shelf',       60,   'shelf-wood'),
  ('bg-paper',         '纸纹底纹',     'bg',          80,   'paper'),
  ('sticker-pencil',   '铅笔记号',     'sticker',     100,  'pencil'),
  ('badge-silver',     '银箔徽章',     'badge_style', 120,  'silver'),
  ('frame-arch',       '拱形凹槽',     'frame',       200,  'frame-arch'),
  ('bg-night',         '深夜底纹',     'bg',          260,  'night'),
  ('sticker-orbit',    '星轨',         'sticker',     320,  'orbit'),
  ('shelf-brass',      '黄铜层架',     'shelf',       380,  'shelf-brass'),
  ('badge-gold',       '金箔徽章',     'badge_style', 450,  'gold'),
  ('plaque-memory',    '纪念铭牌',     'plaque',      500,  'plaque-2'),
  ('frame-plaster',    '石膏浮雕框',   'frame',       600,  'frame-plaster'),
  ('bg-aurora',        '极光底纹',     'bg',          800,  'aurora'),
  ('shelf-glass',      '玻璃展台',     'shelf',       1000, 'shelf-glass'),
  ('badge-halo',       '徽章光晕',     'badge_style', 1200, 'halo'),
  ('sticker-atlas',    '星图',         'sticker',     1400, 'atlas'),
  ('plaque-archive',   '典藏铭牌',     'plaque',      1600, 'plaque-3'),
  ('frame-obsidian',   '黑曜石框',     'frame',       2000, 'frame-obsidian'),
  ('bg-galaxy',        '银河底纹',     'bg',          3000, 'galaxy'),
  ('plaque-archive2',  '档案馆铭牌',   'plaque',      4500, 'plaque-4'),
  ('shelf-gold',       '纯金展台',     'shelf',       6000, 'shelf-gold');

-- 默认 TaskLine：时间轴需要一个可用的看板
INSERT OR IGNORE INTO tasklines (id, name, start_hour, end_hour, sort_index, created_at)
VALUES ('tl-default', '默认 TaskLine', 6, 24, 0, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- scheduled 触发查询用的索引（last_fired_at 列由 db.rs 幂等补建，见 ensure_column）
CREATE INDEX IF NOT EXISTS idx_tasks_sched ON tasks(duration_mode, scheduled_at) WHERE duration_mode = 'scheduled';
