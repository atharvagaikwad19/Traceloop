import React from "react";
import { APP_CONFIG } from "@/lib/config";

/** TraceLoop mark: a continuous trace that loops back on itself, with a node at the crossing. */
export const LogoMark: React.FC<{ size?: number; className?: string }> = ({
  size = 26,
  className = "",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    className={className}
    role="img"
    aria-label={`${APP_CONFIG.displayName} logo`}
  >
    <defs>
      <linearGradient id="tl-grad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7c6cff" />
        <stop offset="1" stopColor="#14b8a6" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="15" fill="url(#tl-grad)" />
    <path
      d="M10 32c0-7 5-12 11-12 12 0 10 24 22 24 6 0 11-5 11-12S49 20 43 20c-12 0-10 24-22 24-6 0-11-5-11-12z"
      fill="none"
      stroke="#fff"
      strokeWidth="4.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="32" cy="32" r="3.6" fill="#0b0e1a" />
  </svg>
);

/** Mark + "Trace" in white and "Loop" in the accent colour. */
export const Logo: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <div className="flex items-center gap-2 select-none">
    <LogoMark size={size} />
    <span className="font-semibold text-[15px] tracking-tight leading-none">
      <span className="text-[#e4e9f7]">Trace</span>
      <span className="text-[#14b8a6]">Loop</span>
    </span>
  </div>
);
