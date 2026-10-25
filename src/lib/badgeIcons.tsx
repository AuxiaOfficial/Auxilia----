import {
  Award,
  BookOpenCheck,
  CalendarCheck,
  CalendarDays,
  Clock,
  Crown,
  Flame,
  Flag,
  Gem,
  Hourglass,
  Layers,
  Library,
  Medal,
  Moon,
  NotebookPen,
  PenLine,
  Rocket,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** 徽章图标：数据库里存 lucide 的名字，这里做映射（图标来自 lucide.dev） */
const MAP: Record<string, LucideIcon> = {
  flag: Flag,
  zap: Zap,
  rocket: Rocket,
  layers: Layers,
  trophy: Trophy,
  clock: Clock,
  timer: Timer,
  sun: Sun,
  moon: Moon,
  hourglass: Hourglass,
  flame: Flame,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  medal: Medal,
  crown: Crown,
  'notebook-pen': NotebookPen,
  'pen-line': PenLine,
  'book-open-check': BookOpenCheck,
  library: Library,
  sparkles: Sparkles,
  target: Target,
  award: Award,
  gem: Gem,
}

export default function BadgeIcon({
  name,
  size = 15,
  strokeWidth = 1.6,
}: {
  name: string
  size?: number
  strokeWidth?: number
}): React.ReactElement {
  const Icon = MAP[name] ?? Award
  return <Icon size={size} strokeWidth={strokeWidth} />
}
