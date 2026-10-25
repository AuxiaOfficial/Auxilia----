/* ============================================================
   阻尼滚轮物理内核
   · 不是 scroll-snap（那太硬），是自己跑的 rAF 循环
   · 惯性滑行 → 速度低于阈值 → 弹簧吸附到整数格
   ============================================================ */

/**
 * 手感参数：要「机械档位」而不是「黄油滑轨」。
 * · 滚轮 = 一格一跳，跳完立刻停住（不再靠惯性滑行）
 * · 弹簧刚度高、阻尼大，落到格位时有一下轻微的定位感，但不晃
 * · 拖拽保留惯性，松手后再吸附
 */
export const WHEEL = {
  ITEM_H: 44,
  FRICTION: 0.8, // 自由滑行衰减（拖拽松手用）
  SPRING_K: 0.42, // 吸附刚度：越大越"咔"
  SPRING_D: 0.62, // 吸附阻尼：越大越不晃
  MIN_VEL: 2.2, // 低于此速度立刻切吸附
  GAIN: 0.035, // 兼容旧调用
  DRAG_GAIN: 1,
  /** 一次滚轮事件最多跳几格（触控板狂甩时的上限） */
  MAX_STEPS: 3,
}

export interface WheelState {
  offset: number
  velocity: number
  target: number | null
}

export function createWheel(initial: number): WheelState {
  return { offset: initial, velocity: 0, target: null }
}

/** 推进一帧；返回 true 表示仍在运动 */
export function stepWheel(s: WheelState, min = 0, max = Infinity): boolean {
  const item = WHEEL.ITEM_H

  if (Math.abs(s.velocity) > WHEEL.MIN_VEL) {
    s.offset += s.velocity
    s.velocity *= WHEEL.FRICTION
  } else {
    if (s.target === null) {
      s.target = Math.round(s.offset / item) * item
      s.velocity = 0
    }
    s.velocity += (s.target - s.offset) * WHEEL.SPRING_K
    s.velocity *= WHEEL.SPRING_D
    s.offset += s.velocity
    if (Math.abs(s.target - s.offset) < 0.25 && Math.abs(s.velocity) < 0.25) {
      s.offset = s.target
      s.velocity = 0
      s.target = null
      return false
    }
  }

  // 边界橡皮筋：越界时把速度往回压
  const low = min * item
  const high = max * item
  if (s.offset < low) {
    s.offset = low + (s.offset - low) * 0.55
    s.velocity *= -0.25
  } else if (s.offset > high) {
    s.offset = high + (s.offset - high) * 0.55
    s.velocity *= -0.25
  }
  return true
}

/** 外部设定值（快捷胶囊）：给一脚初速度，让弹簧动画明确可见 */
export function flingTo(s: WheelState, index: number): void {
  const target = index * WHEEL.ITEM_H
  s.target = target
  s.velocity = (target - s.offset) * 0.12
}

/**
 * 滚轮输入：离散档位。
 * 一次滚动 = 跳 n 格（n 由 deltaY 大小决定，最多 3 格），
 * 跳完由弹簧硬停在整格上 —— 这才是"齿轮"的手感。
 */
export function wheelInput(s: WheelState, deltaY: number): void {
  if (deltaY === 0) return
  const dir = deltaY > 0 ? 1 : -1
  const steps = Math.min(
    WHEEL.MAX_STEPS,
    Math.max(1, Math.round(Math.abs(deltaY) / 100)),
  )
  const base = Math.round((s.target ?? s.offset) / WHEEL.ITEM_H)
  s.target = (base + dir * steps) * WHEEL.ITEM_H
  s.velocity = 0
}

/** 滚轮值（整数格） */
export function wheelIndex(s: WheelState): number {
  return Math.round(s.offset / WHEEL.ITEM_H)
}

/** 每个可见项的视觉参数 */
export function itemVisual(distance: number): { scale: number; opacity: number } {
  const d = Math.abs(distance)
  const span = WHEEL.ITEM_H * 3
  return {
    scale: 1 - Math.min(d / span, 1) * 0.18,
    opacity: 1 - Math.min(d / (span * 1.07), 1) * 0.75,
  }
}
