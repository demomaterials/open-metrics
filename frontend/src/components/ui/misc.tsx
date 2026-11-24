import * as HC from "@radix-ui/react-hover-card";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as T from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-sm", className)} {...props} />;
}

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "good" | "warn" | "bad" | "accent" }) {
  const tones = {
    default: "bg-surface-2 text-muted",
    good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bad: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    accent: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export const HoverCard = HC.Root;
export const HoverCardTrigger = HC.Trigger;
export function HoverCardContent({ className, ...props }: React.ComponentProps<typeof HC.Content>) {
  return (
    <HC.Portal>
      <HC.Content
        sideOffset={8}
        collisionPadding={16}
        className={cn(
          "animate-pop z-40 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 text-sm shadow-xl",
          className,
        )}
        {...props}
      />
    </HC.Portal>
  );
}

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={6}
        align="end"
        className={cn(
          "animate-pop z-50 min-w-48 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl scrollbar-thin",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}
export const DropdownMenuSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-muted", className)} {...props} />;
}

export const Tabs = T.Root;
export const TabsContent = T.Content;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn("inline-flex items-center rounded-lg border border-border bg-surface-2 p-0.5", className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted transition-colors data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      {icon && <div className="text-muted [&_svg]:size-8">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
      aria-label="Loading"
    />
  );
}
