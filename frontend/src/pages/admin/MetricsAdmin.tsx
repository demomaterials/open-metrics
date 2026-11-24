import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, PenLine, Plus, Table2, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Empty, Spinner } from "@/components/ui/misc";
import { del, get } from "@/lib/api";
import { formatValue } from "@/lib/format";
import type { Metric } from "@/lib/types";
import { PageHeader, Table, Td, Th, confirmAction } from "./AdminLayout";

const DIR = { higher_is_better: "Higher is better", lower_is_better: "Lower is better", neutral: "Neutral" };

export default function MetricsAdmin() {
  const qc = useQueryClient();
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: () => get<Metric[]>("/api/metrics") });
  return (
    <>
      <PageHeader
        title="Metrics"
        description="Define a metric once and reuse it on any number of boards."
        actions={
          <Link to="/admin/metrics/new" className={buttonVariants()}>
            <Plus /> New metric
          </Link>
        }
      />
      {metrics.isLoading ? (
        <Spinner />
      ) : metrics.data?.length === 0 ? (
        <Empty title="No metrics yet">Create a managed metric, or map one from an external database.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Metric</Th>
              <Th>Source</Th>
              <Th>Period</Th>
              <Th>Direction</Th>
              <Th>Thresholds</Th>
              <Th className="text-right">Data</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {metrics.data?.map((m) => (
              <tr key={m.id}>
                <Td>
                  <Link to={`/admin/metrics/${m.id}`} className="font-medium hover:underline">{m.name}</Link>
                  <div className="text-xs text-muted">
                    {m.board_count ? `On ${m.board_count} board${m.board_count > 1 ? "s" : ""}` : "Not on any board"}
                  </div>
                </Td>
                <Td>
                  {m.source_type === "external" ? (
                    <Badge tone="accent"><Database className="size-3" /> {m.data_source_name} · {m.source_schema}.{m.source_table}</Badge>
                  ) : (
                    <Badge><PenLine className="size-3" /> Managed</Badge>
                  )}
                </Td>
                <Td className="capitalize text-muted">{m.period_type}ly</Td>
                <Td className="text-muted">{DIR[m.direction]}</Td>
                <Td className="text-xs text-muted tabular-nums">
                  {m.thresholds?.green !== null && m.thresholds?.green !== undefined ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400">● {formatValue(m.thresholds.green, m)}</span>
                      {m.thresholds.amber !== null && <span className="ml-2 text-amber-600 dark:text-amber-400">● {formatValue(m.thresholds.amber, m)}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-right tabular-nums text-muted">{m.source_type === "managed" ? `${m.value_count} values` : "live"}</Td>
                <Td className="whitespace-nowrap text-right">
                  {m.source_type === "managed" && (
                    <Link to={`/admin/metrics/${m.id}/values`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      <Table2 /> Values
                    </Link>
                  )}
                  <Link to={`/admin/metrics/${m.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Edit</Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete metric"
                    onClick={async () => {
                      const extra = m.board_count ? ` It will be removed from ${m.board_count} board(s).` : "";
                      if (!confirmAction(`Delete “${m.name}” and all its stored values?${extra}`)) return;
                      try {
                        await del(`/api/metrics/${m.id}`);
                        toast.success("Metric deleted");
                        qc.invalidateQueries();
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
      )}
    </>
  );
}
