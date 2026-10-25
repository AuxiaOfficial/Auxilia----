/** 完成提示音：用 WebAudio 现场合成，不打包任何音频文件（省体积、无版权问题） */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/**
 * 浏览器/WebView2 的自动播放策略：没有用户手势前 AudioContext 是 suspended，
 * 之后 resume() 也不会生效。所以在第一次点击/按键时先"解锁"一次。
 */
export function unlockAudio(): void {
  const ac = audio()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume()
}

/** 两声很轻的钟片音，整体 < 700ms，不刺耳 */
export function playChime(): void {
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime
  const master = ac.createGain()
  master.gain.value = 0.09
  master.connect(ac.destination)

  const notes = [
    { freq: 880, start: 0 },
    { freq: 1318.5, start: 0.16 },
  ]

  for (const note of notes) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = note.freq
    gain.gain.setValueAtTime(0, now + note.start)
    gain.gain.linearRampToValueAtTime(1, now + note.start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + 0.55)
    osc.connect(gain)
    gain.connect(master)
    osc.start(now + note.start)
    osc.stop(now + note.start + 0.6)
  }
}
