import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Database, Pencil, Plug, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { del, get, post, put } from "@/lib/api";
import type { DataSource } from "@/lib/types";
import { PageHeader, confirmAction } from "./AdminLayout";

interface Form {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslmode: string;
}

function SourceForm({ initial, onSaved }: { initial?: DataSource; onSaved: () => void }) {
  const [f, setF] = useState<Form>({
    name: initial?.name ?? "",
    host: initial?.host ?? "",
    port: initial?.port ?? 5432,
    database: initial?.database ?? "",
    username: initial?.username ?? "",
    password: "",
    sslmode: initial?.sslmode ?? "prefer",
  });
  const [test, setTest] = useState<{ ok: boolean; error?: string; server_version?: string; read_only?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const payload = () => ({ ...f, password: f.password === "" && initial ? null : f.password });
  const set = (k: keyof Form, v: string | number) => (setF({ ...f, [k]: v }), setTest(null));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (initial) await put(`/api/datasources/${initial.id}`, payload());
          else await post("/api/datasources", payload());
          toast.success("Data source saved");
          onSaved();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <Input value={f.name} onChange={(e) => set("name", e.target.value)} required placeholder="Finance warehouse" />
      </Field>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Host">
          <Input value={f.host} onChange={(e) => set("host", e.target.value)} required placeholder="db.internal.example.com" />
        </Field>
        <Field label="Port">
          <Input type="number" value={f.port} onChange={(e) => set("port", Number(e.target.value))} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Database">
          <Input value={f.database} onChange={(e) => set("database", e.target.value)} required />
        </Field>
        <Field label="SSL mode">
          <Select value={f.sslmode} onChange={(e) => set("sslmode", e.target.value)}>
            {["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Username" hint="Use an account with SELECT-only grants.">
          <Input value={f.username} onChange={(e) => set("username", e.target.value)} required autoComplete="off" />
        </Field>
        <Field label="Password" hint={initial?.has_password ? "Leave empty to keep the stored password." : "Encrypted at rest; never sent back to the browser."}>
          <Input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      {test && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${test.ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-rose-500/10 text-rose-800 dark:text-rose-300"}`}>
          {test.ok ? <CheckCircle2 className="mt-0.5 size-4" /> : <XCircle className="mt-0.5 size-4" />}
          <span>{test.ok ? `Connected · ${test.server_version} · read-only session ${test.read_only ? "enforced" : "NOT enforced"}` : test.error}</span>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setTest(await post("/api/datasources/test", { ...payload(), id: initial?.id }));
            } catch (e) {
              setTest({ ok: false, error: (e as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : <Plug />} Test connection
        </Button>
        <Button type="submit" disabled={busy}>Save</Button>
      </div>
    </form>
  );
}

export default function DataSourcesAdmin() {
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["datasources"], queryFn: () => get<DataSource[]>("/api/datasources") });
  const [editing, setEditing] = useState<DataSource | "new" | null>(null);
  const done = () => {
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["datasources"] });
  };
  return (
    <>
      <PageHeader
        title="Data sources"
        description="External PostgreSQL databases that metrics can read from."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New connection
          </Button>
        }
      />
      <Panel className="mb-6 flex gap-3 p-4 text-sm text-muted">
        <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
        <p>
          Every query runs in a read-only transaction with a statement timeout. Tables and columns are checked against the
          source catalogue and quoted; no free-form SQL is executed. Passwords are encrypted with the server key.
        </p>
      </Panel>
      {sources.isLoading ? (
        <Spinner />
      ) : sources.data?.length === 0 ? (
        <Empty title="No data sources" icon={<Database />}>Add a PostgreSQL connection to map external tables into metrics.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sources.data?.map((s) => (
            <Panel key={s.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400">
                    <Database className="size-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted">PostgreSQL · {s.username}@{s.host}:{s.port}/{s.database}</div>
                  </div>
                </div>
                <div className="flex">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(s)} title="Edit">
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={async () => {
                      if (!confirmAction(`Delete data source “${s.name}”?`)) return;
                      try {
                        await del(`/api/datasources/${s.id}`);
                        done();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge tone="good">read-only</Badge>
                <Badge>ssl {s.sslmode}</Badge>
                <Badge tone="accent">{s.metric_count} metric{s.metric_count === 1 ? "" : "s"}</Badge>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "New PostgreSQL connection" : "Edit connection"}>
          {editing && <SourceForm initial={editing === "new" ? undefined : editing} onSaved={done} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
