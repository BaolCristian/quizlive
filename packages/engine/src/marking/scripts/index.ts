/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// GENERATO da scripts/engine/embed-marking-scripts.mjs — non modificare a mano.
// Sorgenti: packages/engine/src/marking/scripts/*.jme (copie verbatim di
// .numbas-upstream/marking_scripts/*.jme, con un'intestazione di licenza).

/** Gli script di correzione predefiniti, indicizzati per tipo di parte. */
export const markingScripts = {
  numberentry: `// Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
// Licensed under the Apache License, Version 2.0. Copia verbatim di marking_scripts/numberentry.jme;
// vedi packages/engine/NOTICE. Le righe che iniziano con "//" sono tolte dal parser delle note.

studentNumber (The student's answer, parsed as a number):
    if(settings["allowFractions"],
        parsedecimal_or_fraction(studentAnswer,settings["notationStyles"])
    ,
        parsedecimal(studentAnswer,settings["notationStyles"])
    )

isInteger (Is the student's answer an integer?):
    countdp(studentAnswer)=0

isFraction (Is the student's answer a fraction?):
    "/" in studentAnswer

numerator (The numerator of the student's answer, or 0 if not a fraction):
    if(isFraction,
        parsenumber(split(studentAnswer,"/")[0],settings["notationStyles"])
    ,
        0
    )

denominator (The numerator of the student's answer, or 0 if not a fraction):
    if(isFraction,
        parsenumber(split(studentAnswer,"/")[1],settings["notationStyles"])
    ,
        0
    )

cancelled (Is the student's answer a cancelled fraction?):
    assert(isFraction and gcd(numerator,denominator)=1,
        assert(not settings["mustBeReduced"],
            multiply_credit(settings["mustBeReducedPC"],translate("part.numberentry.answer not reduced"))
        );
        false
    )

cleanedStudentAnswer:
    cleannumber(studentAnswer, settings["notationStyles"])

student_is_scientific (Is the student's answer written in scientific notation?):
    not isnan(matchnumber(studentAnswer, ["scientific"])[1])

scientific_precision_offset (A number in scientific notation has 1 more significant digit than decimal places):
    award(1,settings["precisionType"]="dp")

studentPrecision:
    max(settings["precision"],
        switch(
            student_is_scientific, countsigfigs(cleanedStudentAnswer)-scientific_precision_offset,
            settings["precisionType"]="dp", max(settings["precision"],countdp(cleanedStudentAnswer)),
            settings["precisionType"]="sigfig", max(settings["precision"],countsigfigs(cleanedStudentAnswer)),
            0
        )
    )

raw_minvalue:
    switch(
        student_is_scientific, siground(settings["minvalue"],studentPrecision+scientific_precision_offset),
        settings["precisionType"]="dp", precround(settings["minvalue"],studentPrecision),
        settings["precisionType"]="sigfig", siground(settings["minvalue"],studentPrecision),
        settings["minvalue"]
    )

raw_maxvalue:
    switch(
        student_is_scientific, siground(settings["maxvalue"],studentPrecision+scientific_precision_offset),
        settings["precisionType"]="dp", precround(settings["maxvalue"],studentPrecision),
        settings["precisionType"]="sigfig", siground(settings["maxvalue"],studentPrecision),
        settings["maxvalue"]
    )

minvalue: min(raw_minvalue,raw_maxvalue)

maxvalue: max(raw_minvalue,raw_maxvalue)

validNumber (Is the student's answer a valid number?):
    if(isnan(studentNumber),
        warn(translate("part.numberentry.answer invalid"));
        fail(translate("part.numberentry.answer invalid"))
    ,
        true
    )

numberInRange (Is the student's number in the allowed range?):
    if(studentNumber>=minvalue and studentNumber<=maxvalue,
        correct()
    ,
        incorrect();
        end()
    )

correctPrecision (Has the student's answer been given to the desired precision?):     
    if(
        if(student_is_scientific,
            togivenprecision_scientific(studentAnswer,settings['precisionType'],settings['precision']),
            togivenprecision(cleanedStudentAnswer,settings['precisionType'],settings['precision'],settings["strictPrecision"])
        )
    ,
        true
    ,
        multiply_credit(settings["precisionPC"],settings["precisionMessage"]);
        false
    )

mark (Mark the student's answer):
    apply(validNumber);
    apply(numberInRange);
    assert(numberInRange,end());
    if(isFraction,
        apply(cancelled)
    ,
        apply(correctPrecision)
    )
 
interpreted_answer (The student's answer, to be reused by other parts):
    apply(validNumber);
    studentNumber

`,
  multipleresponse: `// Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
// Licensed under the Apache License, Version 2.0. Copia verbatim di marking_scripts/multipleresponse.jme;
// vedi packages/engine/NOTICE. Le righe che iniziano con "//" sono tolte dal parser delle note.

numAnswers: len(settings["matrix"])

numChoices: if(numAnswers=1,1,len(settings["matrix"][0]))

numTicks (How many options did the student tick?):
  sum(map(sum(map(if(x,1,0),x,row)),row,studentAnswer))

wrongNumber:
  assert(numTicks >= settings["minAnswers"] and (settings["maxAnswers"]=0 or numTicks<=settings["maxAnswers"]),
    if(settings["warningType"]="prevent",
        fail(translate("part.mcq.wrong number of choices"))
    ,
        incorrect(translate("part.mcq.wrong number of choices"));
        end()
    )
  )

tick_indexes (Indexes of choice/answer pairs):
    flatten(map(
        map([x,y], x, shuffleAnswers),
        y,
        shuffleChoices
    ))

only_ticked_score_ticks (The score for each choice/answer pair):
  map(
    if(studentAnswer[x][y],
      let(distractor,settings["distractors"][x][y], credit, if(marks=0,0,settings["matrix"][x][y]/marks),
        switch(
          credit<>0,
            if(not isnonemptyhtml(distractor),
              add_credit(credit,translate(if(credit>0,'part.mcq.correct choice','part.mcq.incorrect choice')))
            ,
              add_credit(credit,distractor)
            )
          ,
            if(isnonemptyhtml(distractor),negative_feedback(distractor),if(marks<>0,negative_feedback(translate('part.mcq.incorrect choice')),false))
        );credit
      )
    ,
      0
    ),
    [x,y],
    tick_indexes
  )


layout_tick_indexes (Indexes of choice/answer pairs shown in the layout):
    filter(layout[tick[0]][tick[1]],tick,tick_indexes)

binary_score_ticks (Scores and feedback for each choice/answer pair, in the "binary" marking method):
    let(
        per_tick, 1/len(layout_tick_indexes),
        scores,map(
            let(distractor,settings["distractors"][x][y],
                should_tick, settings["matrix"][x][y]>0,
                if(studentAnswer[x][y]=should_tick,
                    per_tick
                ,
                    assert(not isnonemptyhtml(distractor),negative_feedback(distractor));
                    0
                )
            ),
            [x,y],
            layout_tick_indexes
        ),
        total, sum(scores),
        switch(
            total=1,correct(),
            total=0 or settings["markingMethod"]="all-or-nothing",incorrect(),
            set_credit(total,translate('part.marking.partially correct'))
        )
    )

score_ticks:
    switch(
        settings["markingMethod"] in ["score per matched cell","all-or-nothing"], apply(binary_score_ticks);binary_score_ticks,
        apply(only_ticked_score_ticks);only_ticked_score_ticks
    )

total_score: 
    sum(score_ticks)

mark:
  assert(marks>0,correct());  // any answer is correct when 0 marks are available
  assert(settings["markingMethod"]<>"sum ticked cells" or numTicks>0,
    warn(translate("part.marking.nothing entered"));
    fail(translate("part.marking.nothing entered"))
  );
  apply(wrongNumber);
  apply(score_ticks)

choice_indices (The indices of the student's choices):
    j for: j of: 0..numAnswers-1 where: studentAnswer[j][0]

choice_index (The index of the student's choice):
    min(choice_indices)

pair_indices (Answer, choice pairs that the student chose):
    [answer,choice] for: [answer,choice] of: tick_indexes where: studentAnswer[answer][choice]

answer_indices (The index of the chosen answer for each choice):
    min(y for: y of: 0..numAnswers-1 where: studentAnswer[y][x]) for: x of: 0..numChoices-1

interpreted_answer (The student's answer, to be reused by other parts):
    switch(
        settings["interpretedAnswerForm"] = "index of choice",
            choice_index,
        settings["interpretedAnswerForm"] = "text of choice",
            settings["choices"][choice_index],
        settings["interpretedAnswerForm"] = "list of boolean",
            x[0] for: x of: studentAnswer,
        settings["interpretedAnswerForm"] = "indices of choices",
            choice_indices,
        settings["interpretedAnswerForm"] = "text of choices",
            settings["choices"][i] for: i of: choice_indices,
        settings["interpretedAnswerForm"] = "indices of pairs",
            pair_indices,
        settings["interpretedAnswerForm"] = "text of pairs",
            [settings["answers"][answer], settings["choices"][choice]] for: [answer, choice] of: pair_indices,
        settings["interpretedAnswerForm"] = "list of indices",
            answer_indices,
        settings["interpretedAnswerForm"] = "list of texts",
            settings["answers"][i] for: i of: answer_indices,
        // otherwise
            studentAnswer
    )
`,
  patternmatch: `// Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
// Licensed under the Apache License, Version 2.0. Copia verbatim di marking_scripts/patternmatch.jme;
// vedi packages/engine/NOTICE. Le righe che iniziano con "//" sono tolte dal parser delle note.

regex_match (Match the student's answer with the correct answer, interpreted as a regular expression):
  match_regex(settings["correctAnswer"],studentAnswer,"u")

regex_match_case_insensitive (Match the student's answer with the correct answer, interpreted as a case-insensitive regular expression):
  match_regex(settings["correctAnswer"],studentAnswer,"iu")

exact_match (Is the student's answer exactly the correct answer?):
  studentAnswer=settings["correctAnswer"]

exact_match_case_insensitive (Is the student's answer exactly the correct answer?):
  lower(studentAnswer)=lower(settings["correctAnswer"])

matches (Does the student's answer match the correct answer?):
  switch(
    settings["matchMode"]="regex", len(regex_match)>0,
    settings["matchMode"]="exact", exact_match,
    false
  )
      
matches_case_insensitive (Does the student's answer match the correct answer, ignoring case?):
  switch(
    settings["matchMode"]="regex", len(regex_match_case_insensitive)>0,
    settings["matchMode"]="exact", exact_match_case_insensitive,
    false
  )
     

mark:
  assert(settings["allowEmpty"] or len(studentAnswer)>0,
    warn(translate("part.marking.nothing entered"));
    fail(translate("part.marking.nothing entered"))
  );
  if(settings["caseSensitive"],
    if(matches,
      correct(),
      if(matches_case_insensitive,
        set_credit(settings["partialCredit"],translate("part.patternmatch.correct except case")),
        incorrect()
      )
    )
  ,
    if(matches_case_insensitive,
      correct()
    ,
      incorrect()
    )
  )

interpreted_answer (The student's answer, to be reused by other parts):
  studentAnswer
`,
  gapfill: `// Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
// Licensed under the Apache License, Version 2.0. Copia verbatim di marking_scripts/gapfill.jme;
// vedi packages/engine/NOTICE. Le righe che iniziano con "//" sono tolte dal parser delle note.

marked_original_order (Mark the gaps in the original order, mainly to establish if every gap has a valid answer):
    map(
        mark_part(gap["path"],studentAnswer),
        [gap,studentAnswer],
        zip(gaps,studentAnswer)
    )

interpreted_answers (The interpreted answers for each gap, in the original order):
    map(
        res["values"]["interpreted_answer"],
        res,
        marked_original_order
    )

answers (The student's answers to each gap):
    if(settings["sortAnswers"],
        sort(interpreted_answers)
    ,
        interpreted_answers
    )

gap_order:
    if(settings["sortAnswers"],
        sort_destinations(interpreted_answers)
    ,
        gap_adaptive_order
    )

answer_order:
    if(settings["sortAnswers"],
        0..(len(studentAnswer)-1)
    ,
        gap_adaptive_order
    )

gap_feedback (Feedback on each of the gaps):
    map(
        try(
            let(
                answer, studentAnswer[answer_number],
                result, submit_part(gaps[gap_number]["path"],answer),
                gap, gaps[gap_number],
                name, gap["name"],
                noFeedbackIcon, not gap["settings"]["showFeedbackIcon"],
                non_warning_feedback, filter(x["op"]<>"warning",x,result["feedback"]),
                    assert(noFeedbackIcon,
                        assert(name="" or len(gaps)=1 or len(non_warning_feedback)=0,feedback(translate('part.gapfill.feedback header',["name": name])))
                    );
                    concat_feedback(non_warning_feedback, if(marks>0,result["marks"]/marks,1/len(gaps)), noFeedbackIcon);
                    result
            ),
            err,
            fail(translate("part.gapfill.error marking gap",["name": gaps[gap_number]["name"], "message": err]))
        ),
        [gap_number,answer_number],
        zip(gap_order,answer_order)
    )

all_valid (Are the answers to all of the gaps valid?):
  all(map(res["valid"],res,marked_original_order))

mark:
  assert(all_valid or not settings["sortAnswers"], fail(translate("question.can not submit")));
  apply(answers);
  apply(gap_feedback)

interpreted_answer:
  answers

pre_submit:
    map(
        let(
            answer, studentAnswer[answer_number],
            result, submit_part(gaps[gap_number]["path"],answer),
            check_pre_submit(gaps[gap_number]["path"], answer, exec_path)
        ),
        [gap_number,answer_number],
        zip(gap_order,answer_order)
    )
`,
  jme: `// Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
// Licensed under the Apache License, Version 2.0. Copia verbatim di marking_scripts/jme.jme;
// vedi packages/engine/NOTICE. Le righe che iniziano con "//" sono tolte dal parser delle note.

evaluation_scope (The JME scope in which to evaluate answer expressions):
  scope()
  |> add_function_sets(settings["functionSets"])
  |> add_functions(settings["enabledFunctions"])
  |> remove_functions(settings["disabledFunctions"])


expand_juxtapositions_settings (Settings for the "expand juxtapositions" step):
    [
        "singleLetterVariables": settings["singleLetterVariables"],
        "noUnknownFunctions": not settings["allowUnknownFunctions"],
        "implicitFunctionComposition": settings["implicitFunctionComposition"],
        "normaliseSubscripts": true
    ]

studentExpr_empty (If the student's answer is empty, don't try to mark it):
    assert(trim(studentAnswer)<>"" and parse(studentAnswer)<>parse(""),
        warn(translate("part.marking.nothing entered"));
        fail(translate("part.marking.nothing entered"))
    )

notation (The name of the JME notation to use):
    settings["notation"]

studentExpr (The student's answer, parsed):
    apply(studentExpr_empty);
    try(
        simplify(
            expand_juxtapositions(parse(studentAnswer, notation), evaluation_scope, expand_juxtapositions_settings),
            'basic'
        )
    , message,
        warn(translate("part.jme.answer invalid",["message":message]));
        fail(translate("part.jme.answer invalid",["message":message]));
        nothing
    )

cleanedStudentString (The student's answer as a string, cleaned up): string(studentExpr)

scope_vars (Variables already defined in the scope):
    definedvariables()

correctExpr (The correct answer, parsed):
    expand_juxtapositions(parse(settings["correctAnswer"], notation), evaluation_scope, expand_juxtapositions_settings)

studentMatch (The result of matching the student's expression against the pattern):
    scope_case_sensitive(match(studentExpr,settings["mustMatchPattern"]),settings["caseSensitive"])

correctMatch (The result of matching the correct answer against the pattern):
    scope_case_sensitive(match(correctExpr,settings["mustMatchPattern"]),settings["caseSensitive"])

compareName (The name of the matched group from each expression to compare): 
    settings["nameToCompare"]

formula_replacement_pattern: "$v;lhs = ?;rhs"

formula_replacement:
    if(is_formula,
        string(
            substitute(settings, expression("resultsequal(lhs, rhs, checkingType, checkingAccuracy)"))
        )
    ,
        "lhs = rhs"
    )

studentCompare (The part of the student's expression to compare):
    if(settings["mustMatchPattern"]="" or compareName="",
        replace(formula_replacement_pattern, formula_replacement, studentExpr)
    ,
        studentMatch["groups"][compareName]
    )

correctCompare (The part of the correct expression to compare):
    if(settings["mustMatchPattern"]="" or compareName="",
        replace(formula_replacement_pattern, formula_replacement, correctExpr)
    ,
        correctMatch["groups"][compareName]
    )

failNameToCompare (If comparing just a subexpression, stop marking if the student's expression doesn't have that subexpression):
    assert(settings["mustMatchPattern"]="" or compareName="" or (studentMatch["match"] and compareName in studentMatch["groups"]),
        incorrect(settings["mustMatchMessage"]);
        end()
    )

studentVariables (Variables used in the student's answer): 
    scope_case_sensitive(set(findvars(studentCompare)),settings["caseSensitive"])

correctVariables (Variables used in the correct answer):
    scope_case_sensitive(set(findvars(correctCompare)),settings["caseSensitive"])

unexpectedVariables (Unexpected variables used in the student's answer):
    let(uvars, filter(not (x in correctVariables),x,list(studentVariables)),
        assert(not settings["checkVariableNames"] or len(uvars)=0,
            warn(translate("part.jme.unexpected variable name",["name":uvars[0]]));
            feedback(translate("part.jme.unexpected variable name",["name":uvars[0]]))
        );
        uvars
    )

failMinLength (Is the student's answer too short?):
    assert(settings["minLength"]=0 or len(cleanedStudentString)>=settings["minLength"],
        multiply_credit(settings["minLengthPC"],settings["minLengthMessage"]);
        true
    )

failMaxLength:
    assert(settings["maxLength"]=0 or len(cleanedStudentString)<=settings["maxLength"],
        multiply_credit(settings["maxLengthPC"],settings["maxLengthMessage"]);
        true
    )

forbiddenStrings:
    filter(x in cleanedStudentString, x, settings["notAllowed"])

forbiddenStringsPenalty:
    assert(len(forbiddenStrings)=0,
        translate(
          if(len(settings["notAllowed"])=1, 'part.jme.not-allowed one', 'part.jme.not-allowed several'),
          ["strings":map(translate('part.jme.not-allowed bits',["string":str]),str,forbiddenStrings)]
        );
        multiply_credit(settings["notAllowedPC"],settings["notAllowedMessage"]);
        warn(settings["notAllowedMessage"])
    )

requiredStrings:
    filter(not (x in cleanedStudentString), x, settings["mustHave"])

requiredStringsPenalty:
    assert(len(requiredStrings)=0,
        translate(
          if(len(settings["mustHave"])=1, 'part.jme.must-have one', 'part.jme.must-have several'),
          ["strings":map(translate('part.jme.must-have bits',["string":str]),str,forbiddenStrings)]
        );
        multiply_credit(settings["mustHavePC"],settings["mustHaveMessage"]);
        warn(settings["mustHaveMessage"])
    )

vRange (The range to pick variable values from): 
    settings["vsetRangeStart"]..settings["vsetRangeEnd"] # 0

answerVariables (Variables used in either the correct answer or the student's answer):
    correctVariables or studentVariables

formula_match:
  scope_case_sensitive(match(correctExpr,"$v;lhs = ?;rhs"),settings["caseSensitive"])

is_formula (Is the correct answer a formula of the form name = expression?):
  formula_match["match"]

formula_variable (The variable on the left-hand side of the formula, if the correct answer is a formula):
  try(string(formula_match["groups"]["lhs"]),err,"")

formula_expression (The right-hand side of the formula, if the correct answer is a formula):
  formula_match["groups"]["rhs"]

formula_type (The type of value the formula produces, if the correct answer is a formula):
  let(t,scope_case_sensitive(infer_type(formula_expression),settings["caseSensitive"]),
    if(t in ["name",""],"number",t)
  )

value_generator_definitions:
    dict([normalise_subscripts(k), v] for: [k,v] of: items(settings["valueGenerators"]))

value_generators (Expressions which generate values for each variable in the answer):
    dict(map(
        [
          name,
          get(
            value_generator_definitions,
            name,
            if(is_formula and name=formula_variable,
              exec(function("random"),[formula_expression,default_value_generator[formula_type]])
            ,
              default_value_generator[get(variable_types,name,"number")]
            )
          )
        ],
        name,
        answerVariables
    ))

variable_types (Inferred types for each of the variables):
    scope_case_sensitive(infer_variable_types(correctExpr),settings["caseSensitive"])

default_value_generator:
    [
        "number": expression("random(vRange)"),
        "decimal": expression("dec(random(vRange))"),
        "integer": expression("int(random(vRange))"),
        "rational": expression("rational(random(vRange))"),
        "matrix": expression("matrix(repeat(repeat(random(vRange),3),3))"),
        "vector": expression("vector(repeat(random(vRange),3))"),
        "boolean": expression("random(true,false)"),
        "set": expression("set(repeat(random(vRange),5))")
    ]

vset (The sets of variable values to test against):
    try(
        repeat(
            scope_case_sensitive(make_variables(value_generators,vRange),settings["caseSensitive"]),
            settings["vsetRangePoints"]
        ),
        message,
        warn(translate("part.jme.error checking numerically",["message":message]));
        fail(translate("part.jme.error checking numerically",["message":message]));
        []
    )

agree (Do the student's answer and the expected answer agree on each of the sets of variable values?):
    apply(vset);
    map(
        try(
            let(
                scope, case_sensitive(evaluation_scope, settings["caseSensitive"]),
                resultsequal(
                  eval(studentCompare,scope,vars),
                  eval(correctCompare,scope,vars),
                  settings["checkingType"],
                  settings["checkingAccuracy"]
                )
            ),
            message,
            warn(translate("part.jme.answer invalid",["message":message]));
            fail(translate("part.jme.answer invalid",["message":message]));
            false
        ),
        vars,
        vset
    )

numFails (The number of times the student's answer and the expected answer disagree):
    apply(agree);
    len(filter(not x,x,agree))

numericallyCorrect (Is the student's answer numerically correct?):
    apply(numFails);
    if(numFails<settings["failureRate"],
        correct(translate("part.jme.marking.correct"))
    ,
        incorrect()
    )

sameVars (Does the student use the same variables as the correct answer?):
    // Removed, but still defined so that older questions with custom marking algorithms don't break
    nothing

studentMatches (Does the student's answer match the required pattern?):
    matches(studentExpr,settings["mustMatchPattern"])

mustMatchMessage:
    if(settings["mustMatchMessage"]="",
        translate("part.jme.must-match.failed")
    ,
        translate("part.jme.must-match.warning", ["message": settings["mustMatchMessage"]])
    )

failMatchPatternPrevent (Prevent submission if the student's answer doesn't match the required pattern):
    assert(settings["mustMatchWarningTime"]<>"prevent" or studentMatches,
        warn(mustMatchMessage);
        fail(mustMatchMessage)
    )

failMatchPattern (Give feedback if the student's answer doesn't match the required pattern):
    assert(settings["mustMatchPattern"]="" or studentMatches,
        assert(settings["mustMatchWarningTime"]<>"input",
            warn(mustMatchMessage)
        );
        if(compareName="",
            multiply_credit(settings["mustMatchPC"], mustMatchMessage)
        ,
            set_credit(0,mustMatchMessage)
        );
        true
    )

mark:
    apply(studentExpr);
    apply(failNameToCompare);
    apply(unexpectedVariables);
    apply(sameVars);
    apply(failMatchPatternPrevent);
    apply(numericallyCorrect);
    apply(failMinLength);
    apply(failMaxLength);
    apply(forbiddenStringsPenalty);
    apply(requiredStringsPenalty);
    apply(failMatchPattern)

interpreted_answer (The student's answer, to be reused by other parts):
    apply(studentExpr);
    studentExpr

`,
} as const;
