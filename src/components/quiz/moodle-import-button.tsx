"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GraduationCap, Loader2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

interface Props {
  quizId?: string;
  onImported?: () => void;
}

export function MoodleImportButton({ quizId, onImported }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("moodle");

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (quizId) form.append("quizId", quizId);

      const res = await fetch(withBasePath("/api/quiz/moodle-import"), {
        method: "POST",
        body: form,
      });

      const body = await res.json();

      if (res.status === 422) {
        const errMsgs = body.errors
          .map(
            (e: { question: number; message: string }) =>
              `${t("question")} ${e.question}: ${e.message}`
          )
          .join("\n");
        alert(`${t("parseErrors")}\n\n${errMsgs}`);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(body.error || t("importError"));
      }

      // Build result message
      let msg = `${body.imported ?? body.added} ${t("questionsImported")}`;
      if (body.skipped?.length > 0) {
        const skippedList = body.skipped
          .map((s: { type: string; count: number }) => `${s.type} (${s.count})`)
          .join(", ");
        msg += `\n\n${t("skippedTypes")}: ${skippedList}`;
      }
      if (body.errors?.length > 0) {
        msg += `\n\n${body.errors.length} ${t("withErrors")}`;
      }

      alert(msg);

      if (quizId) {
        onImported?.();
      } else {
        router.push(`/dashboard/quiz/${body.id}/edit`);
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("importError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xml"
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
          <GraduationCap className="size-4 mr-2" />
        )}
        {t("importMoodle")}
      </Button>
    </>
  );
}
