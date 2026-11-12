import React from 'react';
import { AlertCircle, Inbox, Loader2, type LucideIcon } from 'lucide-react';

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading records...' }) => (
  <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] py-16 flex flex-col items-center justify-center text-[#777777]">
    <Loader2 className="w-6 h-6 animate-spin text-[#292929] mb-2.5" />
    <span className="text-[16px] font-normal leading-[1.5]">{label}</span>
  </div>
);

export const EmptyState: React.FC<{
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon: Icon = Inbox, title, description, action }) => (
  <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] py-14 px-6 flex flex-col items-center justify-center text-center">
    <div className="w-11 h-11 rounded-[10px] bg-[#F4F4F4] border border-[#E9E9E9] flex items-center justify-center mb-3">
      <Icon className="w-5 h-5 text-[#777777]" />
    </div>
    <h3 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">{title}</h3>
    <p className="text-[14px] leading-[1.45] text-[#777777] mt-1 max-w-md">{description}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <div className="bg-[#D9383A]/8 border border-[#D9383A]/25 rounded-[10px] px-4 py-3 flex items-center justify-between gap-4 mb-4">
    <div className="flex items-center gap-2.5 text-[#D9383A]">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="text-[14px] font-medium leading-[1.45]">{message}</span>
    </div>
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="text-[15px] font-semibold leading-[1.3] text-[#D9383A] underline hover:no-underline shrink-0"
      >
        Retry
      </button>
    ) : null}
  </div>
);

