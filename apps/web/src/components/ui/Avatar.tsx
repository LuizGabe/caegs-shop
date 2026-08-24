import React, { useState } from "react";

export interface AvatarProps {
  src?: string | null | undefined;
  name?: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl" | undefined;
  className?: string | undefined;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = "md",
  className = ""
}) => {
  const [imageError, setImageError] = useState(false);

  const getInitials = (str?: string | null | undefined) => {
    if (!str) return "U";
    const parts = str.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "U";
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (!first) return "U";
    if (parts.length === 1) return first.substring(0, 2).toUpperCase();
    return ((first[0] ?? "") + (last ? (last[0] ?? "") : "")).toUpperCase();
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-lg",
    xl: "w-24 h-24 text-2xl"
  };

  const initials = getInitials(name);

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden border border-slate-200/80 shadow-xs select-none ${sizeClasses[size]} ${className}`}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={name || "User avatar"}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-blue-600 to-indigo-800 text-white font-semibold flex items-center justify-center tracking-tight">
          {initials}
        </div>
      )}
    </div>
  );
};

