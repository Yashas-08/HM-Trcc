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
      className={`group relative flex flex-col justify-between w-full p-3.5 rounded-[8px] border text-left transition-all ${
        isSelected
          ? 'border-[#222222] bg-[#F4F4F4] ring-1 ring-[#222222]'
          : 'border-[#E9E9E9] bg-white hover:border-[#222222] hover:bg-[#FAFAFA]'
      } ${className}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1 w-full">
        <span className="font-slab text-[18px] sm:text-[19px] font-semibold text-[#292929] tracking-tight group-hover:text-[#000000]">
          {roomNumber}
        </span>
        {badgeLabel ? (
          <span
            className={`text-[12px] font-semibold px-2 py-0.5 rounded-[4px] leading-tight ${
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
      </div>

      <div className="flex items-center justify-between gap-1 w-full text-[13px] leading-[1.35]">
        <span className="font-medium text-[#292929] truncate">{primaryMeta}</span>
        {secondaryMeta ? (
          <span className="text-[#777777] text-[12px] truncate shrink-0">{secondaryMeta}</span>
        ) : null}
      </div>
    </button>
  );
};
