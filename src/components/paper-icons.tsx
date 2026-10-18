/**
 * 索引卡图标：文件夹是「带标签的索引卡」，文件是「带横线的索引卡」。
 * 与设计实验页一致；颜色由父级 text-* 控制，夜间为白色。
 */
interface PaperIconProps {
  className?: string;
}

const COMMON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  focusable: false,
} as const;

export function FolderCardIcon({ className }: PaperIconProps) {
  return (
    <svg {...COMMON} aria-hidden="true" className={className}>
      <path d="M4.6 9.1a2.1 2.1 0 0 1 2.1-2.1h2.9l1.7 1.9h6.1a2.1 2.1 0 0 1 2.1 2.1v6.8a2.1 2.1 0 0 1-2.1 2.1H6.7a2.1 2.1 0 0 1-2.1-2.1z" />
    </svg>
  );
}

export function FileCardIcon({ className }: PaperIconProps) {
  return (
    <svg {...COMMON} aria-hidden="true" className={className}>
      <rect x="5.8" y="4.4" width="12.4" height="15.2" rx="2" />
      <path d="M9 9.4h6M9 12.9h3.9" />
    </svg>
  );
}
