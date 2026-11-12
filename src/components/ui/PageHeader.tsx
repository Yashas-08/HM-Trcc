import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div className="min-w-0">
        <h1 className="font-slab text-[30px] font-bold leading-[1.25] text-[#292929] tracking-tight">{title}</h1>
        {subtitle ? <p className="text-[14px] leading-[1.45] text-[#777777] mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2.5 shrink-0">{actions}</div> : null}
    </div>
  );
};

