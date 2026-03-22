import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
  showIcon?: boolean;
  className?: string;
}

export default function Logo({
  size = "md",
  variant = "light",
  showIcon = true,
  className = "",
}: LogoProps) {
  const sizes = {
    sm: { fontSize: "16px", iconSize: 18, dotSize: "5px", dotOffset: "3px" },
    md: { fontSize: "22px", iconSize: 24, dotSize: "7px", dotOffset: "4px" },
    lg: { fontSize: "32px", iconSize: 34, dotSize: "9px", dotOffset: "6px" },
  };

  const { fontSize, iconSize, dotSize, dotOffset } = sizes[size];

  const permitColor = variant === "dark" ? "#ffffff" : "#0f1f3d";
  const checkColor = "#c9a84c";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-extrabold tracking-tight ${className}`}
      style={{ fontSize, lineHeight: 1 }}
      aria-label="PermitCheck"
    >
      {showIcon && (
        <Image
          src="/logo.svg"
          alt=""
          width={iconSize}
          height={iconSize}
          className="flex-shrink-0"
          aria-hidden="true"
        />
      )}
      <span className="inline-flex items-baseline gap-0">
        <span style={{ color: permitColor }}>Permit</span>
        <span style={{ color: checkColor }}>Check</span>
        <span
          style={{
            width: dotSize,
            height: dotSize,
            background: checkColor,
            borderRadius: "50%",
            display: "inline-block",
            marginLeft: "2px",
            marginBottom: dotOffset,
            flexShrink: 0,
          }}
        />
      </span>
    </span>
  );
}
