import { useState } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate, useSearchParams } from "react-router";
import { ChevronDown, KeyRound, LayoutGrid, LogOut, Moon, Presentation, Settings, Sun } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBoards } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/misc";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-indigo-600" />
        <path d="M7 21l6-6 4 4 8-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">
        open<span className="text-indigo-600 dark:text-indigo-400">·</span>metrics
      </span>
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={className} title="Toggle light/dark theme">
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

function ChangePassword({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Change password" description="Use at least 10 characters.">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await post("/api/auth/change-password", { current_password: cur, new_password: next });
              toast.success("Password changed");
              onOpenChange(false);
              setCur("");
              setNext("");
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Current password">
            <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="New password">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>Change password</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const boards = useBoards();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boardMatch = useMatch("/boards/:boardId");
  const currentId = boardMatch ? Number(boardMatch.params.boardId) : undefined;
  const current = boards.data?.find((b) => b.id === currentId);
  const [pw, setPw] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_oklab,var(--bg)_85%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link to="/" className="shrink-0 sm:mr-2">
            <Logo />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="min-w-0 max-w-[10rem] sm:max-w-[16rem]">
                <LayoutGrid />
                <span className="truncate">{current?.name ?? "Boards"}</span>
                <ChevronDown className="text-muted" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Boards</DropdownMenuLabel>
              {boards.data?.map((b) => (
                <DropdownMenuItem key={b.id} onSelect={() => navigate(`/boards/${b.id}`)}>
                  <span className={cn("size-1.5 rounded-full", b.id === currentId ? "bg-indigo-500" : "bg-transparent")} />
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs text-muted">{b.card_count}</span>
                </DropdownMenuItem>
              ))}
              {boards.data?.length === 0 && <div className="px-2.5 py-2 text-sm text-muted">No boards yet</div>}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  "hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg sm:flex",
                  isActive && "bg-surface-2 text-fg",
                )
              }
            >
              <Settings className="size-4" /> Administration
            </NavLink>
          )}
          {currentId && (
            <Button onClick={() => navigate(`/present/${currentId}?${params.toString()}`)}>
              <Presentation /> <span className="hidden sm:inline">Present</span>
            </Button>
          )}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-9 cursor-pointer place-items-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {(user?.display_name || user?.username || "?").slice(0, 1).toUpperCase()}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <div className="text-sm font-medium text-fg">{user?.display_name || user?.username}</div>
                <div className="capitalize">{user?.role}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem className="sm:hidden" onSelect={() => navigate("/admin")}>
                  <Settings /> Administration
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setPw(true)}>
                <KeyRound /> Change password
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  await logout();
                  navigate("/login");
                }}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <Outlet />
      <ChangePassword open={pw} onOpenChange={setPw} />
    </div>
  );
}
