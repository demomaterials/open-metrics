import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { del, get, post, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role, User } from "@/lib/types";
import { PageHeader, Table, Td, Th, confirmAction } from "./AdminLayout";

function UserForm({ initial, onSaved }: { initial?: User; onSaved: () => void }) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "viewer");
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (initial)
            await put(`/api/users/${initial.id}`, { display_name: displayName, role, is_active: active, password: password || null });
          else await post("/api/users", { username, display_name: displayName, role, password });
          toast.success("User saved");
          onSaved();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!!initial} required pattern="[A-Za-z0-9._@-]+" />
        </Field>
        <Field label="Display name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Role" hint={role === "admin" ? "Full administration access." : "Can view boards and presentations."}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="viewer">Viewer (read-only)</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <Field label={initial ? "Reset password" : "Password"} hint="At least 10 characters.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required={!initial} autoComplete="new-password" />
        </Field>
      </div>
      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-indigo-600" /> Account active
        </label>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>Save</Button>
      </div>
    </form>
  );
}

export default function UsersAdmin() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const users = useQuery({ queryKey: ["users"], queryFn: () => get<User[]>("/api/users") });
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const done = () => {
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["users"] });
  };
  return (
    <>
      <PageHeader
        title="Users"
        description="Administrators manage boards, metrics and data; viewers can only view."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New user
          </Button>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>User</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Last sign-in</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {users.data?.map((u) => (
            <tr key={u.id}>
              <Td>
                <div className="font-medium">{u.display_name || u.username}</div>
                <div className="text-xs text-muted">{u.username}</div>
              </Td>
              <Td>
                <Badge tone={u.role === "admin" ? "accent" : "default"}>{u.role === "admin" ? "Administrator" : "Viewer"}</Badge>
              </Td>
              <Td>{u.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</Td>
              <Td className="text-xs text-muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-GB") : "Never"}</Td>
              <Td className="whitespace-nowrap text-right">
                <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title="Edit">
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete"
                  disabled={u.id === me?.id}
                  onClick={async () => {
                    if (!confirmAction(`Delete user ${u.username}?`)) return;
                    try {
                      await del(`/api/users/${u.id}`);
                      done();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "New user" : `Edit ${(editing as User | null)?.username ?? ""}`}>
          {editing && <UserForm initial={editing === "new" ? undefined : editing} onSaved={done} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
