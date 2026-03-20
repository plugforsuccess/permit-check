interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
  className?: string;
}

export default function Logo({
  size = "md",
  variant = "light",
  className = "",
}: LogoProps) {
  const sizes = {
    sm: { fontSize: "16px", dotSize: "5px", dotOffset: "3px" },
    md: { fontSize: "22px", dotSize: "7px", dotOffset: "4px" },
    lg: { fontSize: "32px", dotSize: "9px", dotOffset: "6px" },
  };

  const { fontSize, dotSize, dotOffset } = sizes[size];

  const permitColor = variant === "dark" ? "#ffffff" : "#0f1f3d";
  const checkColor = "#c9a84c";

  return (
    <span
      className={`inline-flex items-baseline gap-0 font-extrabold tracking-tight ${className}`}
      style={{ fontSize, lineHeight: 1 }}
      aria-label="PermitCheck"
    >
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
  );
}
