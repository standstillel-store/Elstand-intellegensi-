import type { ReactNode } from "react";

export function Disclaimer({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber">
      {children ?? (
        <>
          ElVoid AI menyajikan <strong className="font-medium">probability</strong>,{" "}
          <strong className="font-medium">confidence</strong>, dan <strong className="font-medium">risk</strong> berbasis
          data — bukan kepastian pump/dump. Paper trading saja: simulasi, tanpa dana nyata, tidak terhubung ke exchange
          manapun. Bukan nasihat keuangan.
        </>
      )}
    </div>
  );
}
