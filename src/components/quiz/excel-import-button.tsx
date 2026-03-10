"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";

interface Props {
  quizId?: string;
  onImported?: () => void;
}

export function ExcelImportButton({ quizId, onImported }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (quizId) form.append("quizId", quizId);

      const res = await fetch("/api/quiz/excel-import", {
        method: "POST",
        body: form,
      });

      const body = await res.json();

      if (res.status === 422) {
        const errMsgs = body.errors
          .map((e: { sheet: string; row: number; message: string }) => `${e.sheet}, riga ${e.row}: ${e.message}`)
          .join("\n");
        alert(`Errori nel file:\n\n${errMsgs}`);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(body.error || "Errore nell'importazione");
      }

      if (quizId) {
        alert(`${body.added} domande aggiunte al quiz`);
        onImported?.();
      } else {
        router.push(`/dashboard/quiz/${body.id}/edit`);
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore nell'importazione");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 mr-2 animate-spin" />
        ) : (
          <FileSpreadsheet className="size-4 mr-2" />
        )}
        Importa Excel
      </Button>
    </>
  );
}
