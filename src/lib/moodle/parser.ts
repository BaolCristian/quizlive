import type { QuestionInput } from "@/lib/validators/quiz";

export interface MoodleParseError {
  question: number;
  message: string;
}

export interface MoodleParseResult {
  questions: QuestionInput[];
  errors: MoodleParseError[];
  skipped: { type: string; count: number }[];
}

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Simple XML tag content extractor (no dependencies) */
function getTagContent(xml: string, tag: string): string | null {
  // Handle CDATA sections
  const cdataRe = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1];

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Get attribute value from an XML tag */
function getAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*"([^"]*)"`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Get all matching tag blocks */
function getAllTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  let match;
  while ((match = re.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
}

/** Extract question text from Moodle XML question block */
function getQuestionText(questionXml: string): string {
  const questiontext = getTagContent(questionXml, "questiontext");
  if (!questiontext) return "";
  const text = getTagContent(questiontext, "text");
  return text ? stripHtml(text) : "";
}

/** Parse a multichoice question */
function parseMultichoice(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const text = getQuestionText(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  if (answerBlocks.length < 2) {
    errors.push({ question: index, message: "Multiple choice needs at least 2 answers" });
    return null;
  }

  const choices = answerBlocks.map((a) => {
    const fraction = getAttr(a, "answer", "fraction");
    const ansText = getTagContent(a, "text");
    return {
      text: ansText ? stripHtml(ansText) : "",
      isCorrect: fraction !== null && parseFloat(fraction) > 0,
    };
  }).filter((c) => c.text);

  if (!choices.some((c) => c.isCorrect)) {
    errors.push({ question: index, message: "No correct answer found" });
    return null;
  }

  return {
    type: "MULTIPLE_CHOICE",
    text,
    timeLimit: 30,
    points: 1000,
    confidenceEnabled: false,
    options: { choices },
  };
}

/** Parse a truefalse question */
function parseTrueFalse(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const text = getQuestionText(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  let correct = true;

  for (const a of answerBlocks) {
    const fraction = getAttr(a, "answer", "fraction");
    const ansText = getTagContent(a, "text");
    if (fraction && parseFloat(fraction) === 100 && ansText) {
      correct = stripHtml(ansText).toLowerCase() === "true";
    }
  }

  return {
    type: "TRUE_FALSE",
    text,
    timeLimit: 20,
    points: 1000,
    confidenceEnabled: false,
    options: { correct },
  };
}

/** Parse a shortanswer question */
function parseShortAnswer(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const text = getQuestionText(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  const acceptedAnswers: string[] = [];

  for (const a of answerBlocks) {
    const fraction = getAttr(a, "answer", "fraction");
    if (fraction && parseFloat(fraction) > 0) {
      const ansText = getTagContent(a, "text");
      if (ansText) acceptedAnswers.push(stripHtml(ansText));
    }
  }

  if (acceptedAnswers.length === 0) {
    errors.push({ question: index, message: "No accepted answers found" });
    return null;
  }

  return {
    type: "OPEN_ANSWER",
    text,
    timeLimit: 30,
    points: 1000,
    confidenceEnabled: false,
    options: { acceptedAnswers },
  };
}

/** Parse a matching question */
function parseMatching(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const text = getQuestionText(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const subquestions = getAllTags(xml, "subquestion");
  const pairs: { left: string; right: string }[] = [];

  for (const sq of subquestions) {
    const sqText = getTagContent(sq, "text");
    const answer = getTagContent(sq, "answer");
    if (sqText && answer) {
      const left = stripHtml(sqText);
      // answer tag inside subquestion contains another text tag
      const rightText = getTagContent(answer, "text");
      const right = rightText ? stripHtml(rightText) : stripHtml(answer);
      if (left && right) {
        pairs.push({ left, right });
      }
    }
  }

  if (pairs.length < 2) {
    errors.push({ question: index, message: "Matching needs at least 2 pairs" });
    return null;
  }

  return {
    type: "MATCHING",
    text,
    timeLimit: 45,
    points: 1000,
    confidenceEnabled: false,
    options: { pairs },
  };
}

/** Parse a numerical question */
function parseNumerical(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const text = getQuestionText(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  let correctValue: number | undefined;
  let tolerance = 0;

  for (const a of answerBlocks) {
    const fraction = getAttr(a, "answer", "fraction");
    if (fraction && parseFloat(fraction) === 100) {
      const ansText = getTagContent(a, "text");
      if (ansText) correctValue = parseFloat(stripHtml(ansText));
      const tolTag = getTagContent(a, "tolerance");
      if (tolTag) tolerance = parseFloat(tolTag);
    }
  }

  if (correctValue === undefined || isNaN(correctValue)) {
    errors.push({ question: index, message: "Missing correct numeric value" });
    return null;
  }

  return {
    type: "NUMERIC_ESTIMATION",
    text,
    timeLimit: 30,
    points: 1000,
    confidenceEnabled: false,
    options: {
      correctValue,
      tolerance,
      maxRange: tolerance * 3 || 10,
    },
  };
}

/** Parse a Moodle XML string into SAVINT questions */
export function parseMoodleXml(xmlString: string): MoodleParseResult {
  const questions: QuestionInput[] = [];
  const errors: MoodleParseError[] = [];
  const skippedMap = new Map<string, number>();
  let order = 0;

  // Extract all <question> blocks
  const questionBlocks = getAllTags(xmlString, "question");

  for (let i = 0; i < questionBlocks.length; i++) {
    const block = questionBlocks[i];
    const type = getAttr(block, "question", "type");

    if (!type || type === "category") continue;

    let parsed: Omit<QuestionInput, "order"> | null = null;

    switch (type) {
      case "multichoice":
        parsed = parseMultichoice(block, i + 1, errors);
        break;
      case "truefalse":
        parsed = parseTrueFalse(block, i + 1, errors);
        break;
      case "shortanswer":
        parsed = parseShortAnswer(block, i + 1, errors);
        break;
      case "matching":
        parsed = parseMatching(block, i + 1, errors);
        break;
      case "numerical":
        parsed = parseNumerical(block, i + 1, errors);
        break;
      default:
        skippedMap.set(type, (skippedMap.get(type) || 0) + 1);
        break;
    }

    if (parsed) {
      questions.push({ ...parsed, order: order++ } as QuestionInput);
    }
  }

  const skipped = [...skippedMap.entries()].map(([type, count]) => ({
    type,
    count,
  }));

  return { questions, errors, skipped };
}
