import React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  hoverEffect = false,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-sm ${hoverEffect ? "hover:border-slate-300 hover:shadow-md transition-all duration-150 ease-out" : ""
        } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

