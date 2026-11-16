import React from 'react';

export interface RoomBoxProps {
  roomNumber: string;
  primaryMeta: React.ReactNode;
  secondaryMeta?: React.ReactNode;
  badgeLabel?: string;
  badgeTone?: 'neutral' | 'success' | 'warning' | 'lavender' | 'blue';
  isSelected?: boolean;
  onClick: () => void;
  className?: string;
  'aria-label'?: string;
}

export const RoomBox: React.FC<RoomBoxProps> = ({
  roomNumber,
  primaryMeta,
  secondaryMeta,
  badgeLabel,
  badgeTone = 'neutral',
  isSelected = false,
  onClick,
  className = '',
  'aria-label': ariaLabel,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || `Room ${roomNumber}`}
      className={`group relative flex flex-col items-center justify-center w-full min-h-[92px] py-4 px-5 rounded-[10px] border text-center transition-all ${
        isSelected
          ? 'border-[#222222] bg-[#F4F4F4] ring-1 ring-[#222222]'
          : 'border-[#E9E9E9] bg-white hover:border-[#222222] hover:bg-[#FAFAFA]'
      } ${className}`}
    >
      <span className="font-slab text-[22px] md:text-[24px] font-semibold text-[#292929] tracking-tight group-hover:text-[#000000] leading-tight">
        {roomNumber}
      </span>
      <div className="mt-1.5 text-[14px] md:text-[15px] font-medium text-[#777777] group-hover:text-[#292929] transition-colors leading-snug">
        {primaryMeta}
      </div>
      {secondaryMeta ? (
        <div className="text-[12px] text-[#777777] mt-0.5 leading-tight">
          {secondaryMeta}
        </div>
      ) : null}
      {badgeLabel ? (
        <span
          className={`mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-[4px] leading-tight ${
            badgeTone === 'success'
              ? 'bg-[#DDF58A]/50 text-[#1F7A4A]'
              : badgeTone === 'warning'
                ? 'bg-[#C97A16]/15 text-[#A05C0B]'
                : badgeTone === 'lavender'
                  ? 'bg-[#CEB5EF]/40 text-[#4B2C82]'
                  : badgeTone === 'blue'
                    ? 'bg-[#B5DDEC]/50 text-[#1A5B7A]'
                    : 'bg-[#F4F4F4] text-[#292929]'
          }`}
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  );
};
