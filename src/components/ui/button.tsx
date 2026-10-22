import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-honey text-bg",
        ghost: "bg-transparent text-fg",
        line: "border border-line bg-surface text-fg",
      },
      size: {
        md: "h-11 px-4 text-sm",
        sm: "h-10 px-3 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
