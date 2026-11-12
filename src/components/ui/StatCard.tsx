import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'blue' | 'lime' | 'lavender' | 'neutral';
  subtext?: string;
  onClick?: () => void;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  blue: 'bg-[#B5DDEC] border-[#A3D2E4]',
  lime: 'bg-[#DDF58A] border-[#CEE876]',
  lavender: 'bg-[#CEB5EF] border-[#BFA3E4]',
  neutral: 'bg-[#FFFFFF] border-[#E9E9E9]',
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  subtext,
  onClick,
}) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-[12px] border px-4 xl:px-5 py-4 flex items-center gap-3 xl:gap-4 transition-shadow ${TONE_CLASSES[tone]} ${
        onClick ? 'cursor-pointer hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#292929]/20' : ''
      }`}
    >
      <div
        className={`w-10 h-10 xl:w-11 xl:h-11 rounded-[10px] flex items-center justify-center shrink-0 ${
          tone === 'neutral' ? 'bg-[#F4F4F4] border border-[#E9E9E9]' : 'bg-[#FFFFFF]'
        }`}
      >
        <Icon className="w-5 h-5 text-[#292929]" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-normal leading-[1.4] text-[#292929]/80 whitespace-nowrap">{label}</div>
        <div className="font-slab text-[32px] font-bold text-[#292929] leading-[1.15] mt-0.5 tabular-nums">
          {value}
        </div>
        {subtext ? (
          <div className="text-[14px] leading-[1.35] text-[#777777] mt-0.5">{subtext}</div>
        ) : null}
      </div>
    </Tag>
  );
};

