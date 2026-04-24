import React from "react";
import Loader from "./Loader";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  isLoading?: boolean; // Added for consistency with requirements
  loadingText?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  isLoading = false,
  loadingText,
  icon,
  iconRight,
  children,
  className = "",
  disabled,
  style,
  ...props
}) => {
  const isLoadingState = loading || isLoading;
  
  const base =
    "font-bold uppercase tracking-wide transition-transform duration-200 border-2 border-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2";

  const variants: Record<string, string> = {
    primary: "bg-black text-white hover:-translate-x-1 hover:-translate-y-1",
    outline: "bg-white text-black hover:-translate-x-1 hover:-translate-y-1",
    ghost: "bg-transparent text-black border-transparent hover:border-black",
  };

  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const shadow = variant !== "ghost" ? "4px 4px 0px 0px rgba(0,0,0,1)" : "none";

  // Preserve button width during loading
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [preservedWidth, setPreservedWidth] = React.useState<number | undefined>();

  React.useEffect(() => {
    if (buttonRef.current && !isLoadingState && !preservedWidth) {
      setPreservedWidth(buttonRef.current.offsetWidth);
    }
  }, [isLoadingState, preservedWidth]);

  const leadingIcon = isLoadingState ? (
    <Loader size="sm" {...({ role: "status", "aria-label": "Loading" } as any)} />
  ) : icon;
  
  const content = isLoadingState 
    ? (loadingText || "Loading...") 
    : children;

  const buttonStyle = {
    boxShadow: shadow,
    ...(isLoadingState && preservedWidth ? { width: preservedWidth } : {}),
    ...style,
  };

  return (
    <button
      ref={buttonRef}
      className={`inline-flex items-center justify-center gap-2 ${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoadingState}
      style={buttonStyle}
      {...props}
    >
      {leadingIcon}
      {content}
      {!isLoadingState && iconRight}
    </button>
  );
};

export default Button;