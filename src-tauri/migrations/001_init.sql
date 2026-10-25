-- Auxilia 初始 schema（对应 docs/02 §5.1）。幂等：可重复执行。
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- 任务 ----------
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  note             TEXT NOT NULL DEFAULT '',
  lifecycle        TEXT NOT NULL CHECK(lifecycle IN ('permanent','disposable','expiring')),
  expire_at        INTEGER,
  duration_mode    TEXT NOT NULL CHECK(duration_mode IN ('countdown','countup','scheduled')),
  planned_seconds  INTEGER NOT NULL DEFAULT 0,
  scheduled_at     INTEGER,
  alert_dialog     INTEGER NOT NULL DEFAULT 1,
  alert_flash      INTEGER NOT NULL DEFAULT 0,
  alert_sound      INTEGER NOT NULL DEFAULT 0,
  display_mode     TEXT NOT NULL DEFAULT 'topbar'
                     CHECK(display_mode IN ('topbar','none','float')),
  status           TEXT NOT NULL DEFAULT 'idle'
                     CHECK(status IN ('idle','running','paused')),
  total_seconds    INTEGER NOT NULL DEFAULT 0,
  level            INTEGER NOT NULL DEFAULT 1,
  run_count        INTEGER NOT NULL DEFAULT 0,
  last_active_at   INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  deleted_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_expire ON tasks(lifecycle, expire_at);

-- ---------- 一次执行 ----------
CREATE TABLE IF NOT EXISTS task_runs (
  id                TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  prospect          TEXT NOT NULL DEFAULT '',
  started_at        INTEGER NOT NULL,
  ended_at          INTEGER,
  active_seconds    INTEGER NOT NULL DEFAULT 0,
  paused_seconds    INTEGER NOT NULL DEFAULT 0,
  interruptions     INTEGER NOT NULL DEFAULT 0,
  outcome           TEXT NOT NULL DEFAULT '',
  reflect_moment    TEXT NOT NULL DEFAULT '',
  reflect_next      TEXT NOT NULL DEFAULT '',
  result            TEXT CHECK(result IN ('completed','aborted','crashed')),
  coin_earned       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON task_runs(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_open ON task_runs(ended_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS run_segments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_seg_run ON run_segments(run_id);

-- ---------- TaskLine ----------
CREATE TABLE IF NOT EXISTS tasklines (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  start_hour INTEGER NOT NULL DEFAULT 6,
  end_hour   INTEGER NOT NULL DEFAULT 24,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS taskline_entries (
  id            TEXT PRIMARY KEY,
  taskline_id   TEXT NOT NULL REFERENCES tasklines(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  minute_of_day INTEGER NOT NULL CHECK(minute_of_day BETWEEN 0 AND 1439),
  sort_index    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tle_tl ON taskline_entries(taskline_id, minute_of_day);

-- ---------- 成就 ----------
CREATE TABLE IF NOT EXISTS badges (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  tier        TEXT NOT NULL DEFAULT 'bronze' CHECK(tier IN ('bronze','silver','gold')),
  reward_coin INTEGER NOT NULL DEFAULT 0,
  condition   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_badges (
  code      TEXT PRIMARY KEY REFERENCES badges(code),
  earned_at INTEGER NOT NULL,
  redeemed  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallet (
  id   INTEGER PRIMARY KEY CHECK(id = 1),
  coin INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO wallet(id, coin) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS decorations (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL CHECK(kind IN ('sticker','frame','bg')),
  price INTEGER NOT NULL,
  asset TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owned_decorations (
  decoration_id TEXT PRIMARY KEY REFERENCES decorations(id),
  bought_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wall_items (
  id     TEXT PRIMARY KEY,
  kind   TEXT NOT NULL CHECK(kind IN ('decoration','badge','task')),
  ref_id TEXT NOT NULL,
  x      REAL NOT NULL,
  y      REAL NOT NULL,
  scale  REAL NOT NULL DEFAULT 1,
  z      INTEGER NOT NULL DEFAULT 0
);

-- ---------- 复盘 ----------
CREATE TABLE IF NOT EXISTS reviews (
  id           TEXT PRIMARY KEY,
  period       TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly')),
  period_start INTEGER NOT NULL,
  period_end   INTEGER NOT NULL,
  content_md   TEXT NOT NULL,
  file_path    TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS review_settings (
  id              INTEGER PRIMARY KEY CHECK(id = 1),
  daily_on        INTEGER NOT NULL DEFAULT 1,
  daily_hour      INTEGER NOT NULL DEFAULT 21,
  weekly_on       INTEGER NOT NULL DEFAULT 1,
  weekly_dow      INTEGER NOT NULL DEFAULT 0,
  weekly_hour     INTEGER NOT NULL DEFAULT 20,
  monthly_on      INTEGER NOT NULL DEFAULT 1,
  monthly_dom     INTEGER NOT NULL DEFAULT 1,
  monthly_hour    INTEGER NOT NULL DEFAULT 10,
  export_dir      TEXT,
  last_daily_at   INTEGER NOT NULL DEFAULT 0,
  last_weekly_at  INTEGER NOT NULL DEFAULT 0,
  last_monthly_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO review_settings(id) VALUES (1);

-- ---------- 设置 / 崩溃恢复 ----------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  id          INTEGER PRIMARY KEY CHECK(id = 1),
  run_id      TEXT,
  heartbeat   INTEGER NOT NULL DEFAULT 0,
  clean_exit  INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO app_state(id) VALUES (1);
