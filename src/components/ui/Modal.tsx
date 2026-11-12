import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const WIDTH_MAP: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[580px]',
  lg: 'max-w-[740px]',
  xl: 'max-w-[920px]',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'md',
  children,
  footer,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#222222]/45 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${WIDTH_MAP[maxWidth]} bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] shadow-xl flex flex-col max-h-[86vh]`}
      >
        <div className="px-6 py-4 border-b border-[#E9E9E9] flex items-start justify-between gap-4">
          <div>
            <h2 className="font-slab text-[22px] font-bold leading-[1.3] text-[#292929]">{title}</h2>
            {subtitle ? <p className="text-[14px] leading-[1.45] text-[#777777] mt-0.5">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-[8px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto main-scroll flex-1">{children}</div>

        {footer ? (
          <div className="px-6 py-3.5 border-t border-[#E9E9E9] bg-[#FAFAFA] rounded-b-[12px] flex items-center justify-end gap-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};

