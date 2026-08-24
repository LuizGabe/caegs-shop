import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-3xl bg-white/60 backdrop-blur-md border border-slate-200/70 shadow-xs my-6">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-100/80 text-slate-500 flex items-center justify-center mb-4 shadow-inner">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-800 tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500 leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};

