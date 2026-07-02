// ChurnCard — 候选流转（蓝图 §2.1）：calibration.candidateChurn 的 entered/exited/retained。
// 流转本身无好坏语义，计数用中性 ink 色，仅用 chips 列出代码明细。
import { Shuffle } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { CalibrationSnapshot } from "@/lib/types";

interface ChurnCardProps {
  calibration: CalibrationSnapshot | null;
}

const MAX_CODE_CHIPS = 6;

function ChurnColumn({ label, codes }: { label: string; codes: string[] }) {
  const shown = codes.slice(0, MAX_CODE_CHIPS);
  const rest = codes.length - shown.length;
  return (
    <div className="min-w-0">
      <div className="num text-xl font-medium leading-none text-ink">{codes.length}</div>
      <div className="mt-1 text-2xs uppercase tracking-wider text-ink-3">{label}</div>
      {shown.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {shown.map((code) => (
            <span key={code} className="num rounded-pill bg-raised px-1.5 py-0.5 text-2xs text-ink-2">
              {code}
            </span>
          ))}
          {rest > 0 && <span className="num rounded-pill px-1 py-0.5 text-2xs text-ink-3">+{rest}</span>}
        </div>
      )}
    </div>
  );
}

export function ChurnCard({ calibration }: ChurnCardProps) {
  const churn = calibration?.candidateChurn;

  return (
    <section aria-label="候选流转" className="rounded-card border border-line bg-surface p-4">
      <SectionTitle
        icon={Shuffle}
        title="候选流转"
        hint={
          churn && (churn.previousRunId || churn.latestRunId)
            ? `${churn.previousRunId ?? "—"} → ${churn.latestRunId ?? "—"}`
            : undefined
        }
        className="mb-4"
      />
      {!churn ? (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-xs leading-relaxed text-ink-3">
          未生成校准快照 — 运行 <span className="num">npm run calibration</span> 后展示批次间候选进出与留存。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <ChurnColumn label="新进" codes={churn.entered} />
          <ChurnColumn label="退出" codes={churn.exited} />
          <ChurnColumn label="留存" codes={churn.retained} />
        </div>
      )}
    </section>
  );
}
