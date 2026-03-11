"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Download } from "lucide-react";

export function ExportButtons({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex gap-2">
      <Link
        href={`/api/stats/export?sessionId=${sessionId}&format=csv`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Download className="mr-2 h-4 w-4" />
        Esporta CSV
      </Link>
      <Link
        href={`/api/stats/export?sessionId=${sessionId}&format=pdf`}
        target="_blank"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Download className="mr-2 h-4 w-4" />
        Esporta PDF
      </Link>
    </div>
  );
}
