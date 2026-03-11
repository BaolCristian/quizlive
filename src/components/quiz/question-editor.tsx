"use client";

import { useState } from "react";
import { type QuestionInput } from "@/lib/validators/quiz";
import { Trash2, Plus, Clock, Star, Image, Upload, Search, HelpCircle } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { ImageSearchDialog } from "@/components/quiz/image-search";
import { QuestionHelpDialog } from "@/components/quiz/question-help-dialog";
import { SpotErrorEditor } from "@/components/quiz/spot-error-editor";
import { NumericEstimationEditor } from "@/components/quiz/numeric-estimation-editor";
import { ImageHotspotEditor } from "@/components/quiz/image-hotspot-editor";
import { CodeCompletionEditor } from "@/components/quiz/code-completion-editor";
import { ConfidenceToggle } from "@/components/quiz/confidence-toggle";

interface Props {
  question: QuestionInput;
  index: number;
  total: number;
  onChange: (index: number, question: QuestionInput) => void;
  onRemove: (index: number) => void;
}

const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Scelta multipla", icon: "🔘" },
  { value: "TRUE_FALSE", label: "Vero / Falso", icon: "✅" },
  { value: "OPEN_ANSWER", label: "Risposta aperta", icon: "✏️" },
  { value: "ORDERING", label: "Ordinamento", icon: "🔢" },
  { value: "MATCHING", label: "Abbinamento", icon: "🔗" },
  { value: "SPOT_ERROR", label: "Trova l'errore", icon: "🔍" },
  { value: "NUMERIC_ESTIMATION", label: "Stima numerica", icon: "🔢" },
  { value: "IMAGE_HOTSPOT", label: "Hotspot immagine", icon: "🎯" },
  { value: "CODE_COMPLETION", label: "Completa il codice", icon: "💻" },
] as const;

type QuestionType = QuestionInput["type"];

function defaultOptionsForType(type: QuestionType): QuestionInput["options"] {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return { choices: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] };
    case "TRUE_FALSE":
      return { correct: true };
    case "OPEN_ANSWER":
      return { acceptedAnswers: [""] };
    case "ORDERING":
      return { items: ["", ""], correctOrder: [0, 1] };
    case "MATCHING":
      return { pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
    case "SPOT_ERROR":
      return { lines: ["", ""], errorIndices: [], explanation: undefined };
    case "NUMERIC_ESTIMATION":
      return { correctValue: 0, tolerance: 5, maxRange: 50, unit: undefined };
    case "IMAGE_HOTSPOT":
      return { imageUrl: "", hotspot: { x: 0.5, y: 0.5, radius: 0.1 }, tolerance: 0.05 };
    case "CODE_COMPLETION":
      return { codeLines: ["", ""], blankLineIndex: 0, correctAnswer: "", mode: "text" as const };
  }
}

export function QuestionEditor({ question, index, total, onChange, onRemove }: Props) {
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleFieldChange = (field: keyof QuestionInput, value: unknown) => {
    onChange(index, { ...question, [field]: value });
  };

  const handleTypeChange = (newType: QuestionType) => {
    onChange(index, { ...question, type: newType, options: defaultOptionsForType(newType) });
  };

  const currentType = QUESTION_TYPES.find((t) => t.value === question.type);

  return (
    <div className="px-6 py-5 lg:px-10 lg:py-6 space-y-6">
      {/* ── Header: question number + delete ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">
          Domanda {index + 1}
          <span className="text-slate-400 font-normal text-lg lg:text-xl ml-1">
            / {total}
          </span>
        </h2>
        <button
          onClick={() => onRemove(index)}
          disabled={total <= 1}
          className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Elimina domanda"
        >
          <Trash2 className="size-5" />
        </button>
      </div>

      {/* ── Type selector — prominent row ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          Tipo di domanda
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleTypeChange(t.value as QuestionType)}
                className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-center transition-all ${
                  question.type === t.value
                    ? "bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-500 text-indigo-700 dark:text-indigo-300"
                    : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                <span className="text-[10px] font-semibold leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors shrink-0 self-start"
            title="Aiuto su questo tipo di domanda"
          >
            <HelpCircle className="size-5" />
          </button>
        </div>
      </div>

      {/* ── Question text — prominent ── */}
      <div>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          Testo della domanda
        </label>
        <textarea
          value={question.text}
          onChange={(e) => handleFieldChange("text", e.target.value)}
          placeholder="Scrivi qui la domanda..."
          rows={3}
          className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-5 py-4 text-xl lg:text-2xl font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none"
        />
      </div>

      {/* ── Media block — clear actions ── */}
      <div>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          Immagine (opzionale)
        </label>
        {question.mediaUrl ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="flex flex-col items-center gap-3">
              {(/^https?:\/\//.test(question.mediaUrl) || question.mediaUrl.startsWith("/uploads/") || question.mediaUrl.startsWith("/api/uploads/")) && (
                <img
                  src={question.mediaUrl.startsWith("/") ? withBasePath(question.mediaUrl) : question.mediaUrl}
                  alt="Anteprima"
                  className="max-h-48 max-w-full object-contain rounded-xl"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleFieldChange("mediaUrl", null);
                    setShowImageSearch(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Search className="size-3.5" />
                  Cambia
                </button>
                <button
                  type="button"
                  onClick={() => handleFieldChange("mediaUrl", null)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  Rimuovi
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
              <Image className="size-6 text-slate-400" />
              <input
                type="url"
                placeholder="Incolla URL immagine..."
                onBlur={(e) => {
                  if (e.target.value && /^https?:\/\//.test(e.target.value))
                    handleFieldChange("mediaUrl", e.target.value);
                }}
                className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none min-w-0 text-center sm:text-left"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowImageSearch(true)}
                  className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold px-3 py-2 rounded-lg text-sm border border-indigo-200 dark:border-indigo-700 transition-colors"
                >
                  <Search className="size-3.5" />
                  Cerca
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-semibold px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-600 transition-colors">
                  <Upload className="size-3.5" />
                  Carica
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const form = new FormData();
                      form.append("file", file);
                      try {
                        const res = await fetch(withBasePath("/api/upload"), {
                          method: "POST",
                          body: form,
                        });
                        if (!res.ok) throw new Error();
                        const { url } = await res.json();
                        handleFieldChange("mediaUrl", url);
                      } catch {
                        alert("Errore nel caricamento dell'immagine");
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Answers section ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{currentType?.icon}</span>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Risposte
          </p>
        </div>
        {question.type === "MULTIPLE_CHOICE" && (
          <MultipleChoiceEditor
            options={question.options as { choices: { text: string; isCorrect: boolean }[] }}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "TRUE_FALSE" && (
          <TrueFalseEditor
            options={question.options as { correct: boolean }}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "OPEN_ANSWER" && (
          <OpenAnswerEditor
            options={question.options as { acceptedAnswers: string[] }}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "ORDERING" && (
          <OrderingEditor
            options={question.options as { items: string[]; correctOrder: number[] }}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "MATCHING" && (
          <MatchingEditor
            options={question.options as { pairs: { left: string; right: string }[] }}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "SPOT_ERROR" && (
          <SpotErrorEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "NUMERIC_ESTIMATION" && (
          <NumericEstimationEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "IMAGE_HOTSPOT" && (
          <ImageHotspotEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "CODE_COMPLETION" && (
          <CodeCompletionEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
      </div>

      {/* ── Settings — footer ── */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
          <Clock className="size-4 text-amber-500" />
          <input
            type="number"
            min={5}
            max={120}
            value={question.timeLimit}
            onChange={(e) => handleFieldChange("timeLimit", Number(e.target.value))}
            className="w-12 bg-transparent text-base font-semibold text-slate-700 dark:text-slate-300 outline-none text-center"
          />
          <span className="text-sm text-slate-400">sec</span>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
          <Star className="size-4 text-amber-500" />
          <input
            type="number"
            min={100}
            max={2000}
            step={100}
            value={question.points}
            onChange={(e) => handleFieldChange("points", Number(e.target.value))}
            className="w-16 bg-transparent text-base font-semibold text-slate-700 dark:text-slate-300 outline-none text-center"
          />
          <span className="text-sm text-slate-400">pt</span>
        </div>
        <ConfidenceToggle
          enabled={(question as any).confidenceEnabled ?? false}
          onChange={(enabled) => handleFieldChange("confidenceEnabled" as any, enabled)}
        />
      </div>

      {/* Help dialog */}
      {showHelp && (
        <QuestionHelpDialog type={question.type} onClose={() => setShowHelp(false)} />
      )}

      {/* Image search dialog */}
      {showImageSearch && (
        <ImageSearchDialog
          onSelect={(url) => {
            handleFieldChange("mediaUrl", url);
            setShowImageSearch(false);
          }}
          onClose={() => setShowImageSearch(false)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  Sub-editors                                                         */
/* ══════════════════════════════════════════════════════════════════════ */

const MC_COLORS = [
  { bg: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800", active: "bg-red-100 border-red-400 ring-2 ring-red-300 dark:bg-red-900 dark:border-red-500", dot: "bg-red-500" },
  { bg: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800", active: "bg-blue-100 border-blue-400 ring-2 ring-blue-300 dark:bg-blue-900 dark:border-blue-500", dot: "bg-blue-500" },
  { bg: "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800", active: "bg-amber-100 border-amber-400 ring-2 ring-amber-300 dark:bg-amber-900 dark:border-amber-500", dot: "bg-amber-500" },
  { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800", active: "bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300 dark:bg-emerald-900 dark:border-emerald-500", dot: "bg-emerald-500" },
];

function MultipleChoiceEditor({
  options, onChange,
}: {
  options: { choices: { text: string; isCorrect: boolean }[] };
  onChange: (opts: { choices: { text: string; isCorrect: boolean }[] }) => void;
}) {
  const { choices } = options;

  const updateChoice = (i: number, partial: Partial<{ text: string; isCorrect: boolean }>) => {
    onChange({ choices: choices.map((c, idx) => (idx === i ? { ...c, ...partial } : c)) });
  };

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        {choices.map((choice, i) => {
          const color = MC_COLORS[i % MC_COLORS.length];
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                choice.isCorrect ? color.active : color.bg
              }`}
            >
              <button
                type="button"
                onClick={() => updateChoice(i, { isCorrect: !choice.isCorrect })}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                  choice.isCorrect ? `${color.dot} border-transparent` : "border-slate-300 bg-white dark:bg-slate-700"
                }`}
              >
                {choice.isCorrect && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <input
                value={choice.text}
                onChange={(e) => updateChoice(i, { text: e.target.value })}
                placeholder={`Scelta ${i + 1}`}
                className="flex-1 bg-transparent text-lg lg:text-xl font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
              />
              {choices.length > 2 && (
                <button
                  onClick={() => onChange({ choices: choices.filter((_, idx) => idx !== i) })}
                  className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {choices.length < 6 && (
        <button
          onClick={() => onChange({ choices: [...choices, { text: "", isCorrect: false }] })}
          className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="size-5" /> Aggiungi scelta
        </button>
      )}
    </div>
  );
}

function TrueFalseEditor({
  options, onChange,
}: {
  options: { correct: boolean };
  onChange: (opts: { correct: boolean }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => onChange({ correct: true })}
        className={`py-5 rounded-xl text-xl lg:text-2xl font-bold transition-all border-2 ${
          options.correct
            ? "bg-emerald-100 dark:bg-emerald-900 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm"
            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-emerald-300"
        }`}
      >
        Vero
      </button>
      <button
        onClick={() => onChange({ correct: false })}
        className={`py-5 rounded-xl text-xl lg:text-2xl font-bold transition-all border-2 ${
          !options.correct
            ? "bg-red-100 dark:bg-red-900 border-red-500 text-red-700 dark:text-red-300 shadow-sm"
            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-red-300"
        }`}
      >
        Falso
      </button>
    </div>
  );
}

function OpenAnswerEditor({
  options, onChange,
}: {
  options: { acceptedAnswers: string[] };
  onChange: (opts: { acceptedAnswers: string[] }) => void;
}) {
  const { acceptedAnswers } = options;

  return (
    <div className="space-y-3">
      {acceptedAnswers.map((answer, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm font-bold shrink-0">
            {i + 1}
          </div>
          <input
            value={answer}
            onChange={(e) => {
              const next = acceptedAnswers.map((a, idx) => (idx === i ? e.target.value : a));
              onChange({ acceptedAnswers: next });
            }}
            placeholder={`Risposta ${i + 1}`}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg lg:text-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {acceptedAnswers.length > 1 && (
            <button onClick={() => onChange({ acceptedAnswers: acceptedAnswers.filter((_, idx) => idx !== i) })} className="text-slate-400 hover:text-red-500 p-1 transition-colors">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => onChange({ acceptedAnswers: [...acceptedAnswers, ""] })}
        className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="size-5" /> Aggiungi risposta
      </button>
    </div>
  );
}

function OrderingEditor({
  options, onChange,
}: {
  options: { items: string[]; correctOrder: number[] };
  onChange: (opts: { items: string[]; correctOrder: number[] }) => void;
}) {
  const { items } = options;

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-bold shrink-0">
            {i + 1}
          </div>
          <input
            value={item}
            onChange={(e) => {
              const next = items.map((it, idx) => (idx === i ? e.target.value : it));
              onChange({ items: next, correctOrder: next.map((_, idx) => idx) });
            }}
            placeholder={`Elemento ${i + 1}`}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg lg:text-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {items.length > 2 && (
            <button
              onClick={() => {
                const next = items.filter((_, idx) => idx !== i);
                onChange({ items: next, correctOrder: next.map((_, idx) => idx) });
              }}
              className="text-slate-400 hover:text-red-500 p-1 transition-colors"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          const next = [...items, ""];
          onChange({ items: next, correctOrder: next.map((_, idx) => idx) });
        }}
        className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="size-5" /> Aggiungi elemento
      </button>
    </div>
  );
}

function MatchingEditor({
  options, onChange,
}: {
  options: { pairs: { left: string; right: string }[] };
  onChange: (opts: { pairs: { left: string; right: string }[] }) => void;
}) {
  const { pairs } = options;

  return (
    <div className="space-y-3">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex items-center justify-center text-sm font-bold shrink-0">
            {i + 1}
          </div>
          <input
            value={pair.left}
            onChange={(e) => {
              const next = pairs.map((p, idx) => (idx === i ? { ...p, left: e.target.value } : p));
              onChange({ pairs: next });
            }}
            placeholder={`Sinistra ${i + 1}`}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg lg:text-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-slate-400 text-lg">↔</span>
          <input
            value={pair.right}
            onChange={(e) => {
              const next = pairs.map((p, idx) => (idx === i ? { ...p, right: e.target.value } : p));
              onChange({ pairs: next });
            }}
            placeholder={`Destra ${i + 1}`}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg lg:text-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {pairs.length > 2 && (
            <button
              onClick={() => onChange({ pairs: pairs.filter((_, idx) => idx !== i) })}
              className="text-slate-400 hover:text-red-500 p-1 transition-colors"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => onChange({ pairs: [...pairs, { left: "", right: "" }] })}
        className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="size-5" /> Aggiungi coppia
      </button>
    </div>
  );
}
