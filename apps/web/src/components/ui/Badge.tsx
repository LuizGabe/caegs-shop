import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "emerald" | "amber" | "blue" | "indigo" | "slate" | "rose" | "purple" | "cyan" | "sky" | undefined;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "slate",
  dot = false,
  className = "",
  ...props
}) => {
  const variantStyles = {
    emerald: "bg-blue-50 text-blue-950 border-blue-200/70",
    amber: "bg-amber-50 text-amber-900 border-amber-200/60",
    blue: "bg-blue-50 text-blue-950 border-blue-200/70",
    indigo: "bg-indigo-50 text-indigo-900 border-indigo-200/70",
    sky: "bg-sky-50 text-sky-800 border-sky-200/60",
    slate: "bg-slate-100 text-slate-700 border-slate-200/80",
    rose: "bg-rose-50 text-rose-800 border-rose-200/60",
    purple: "bg-indigo-50 text-indigo-900 border-indigo-200/70",
    cyan: "bg-cyan-50 text-cyan-800 border-cyan-200/60"
  };

  const dotColors = {
    emerald: "bg-blue-900",
    amber: "bg-amber-500",
    blue: "bg-blue-900",
    indigo: "bg-indigo-700",
    sky: "bg-sky-500",
    slate: "bg-slate-400",
    rose: "bg-rose-500",
    purple: "bg-indigo-700",
    cyan: "bg-cyan-500"
  };

  const safeVariant = variant ?? "slate";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border ${variantStyles[safeVariant]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[safeVariant]}`} />}
      {children}
    </span>
  );
};

