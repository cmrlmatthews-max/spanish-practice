/* runner.js - runs one lesson: start, voices, exercises, and the end.
 * SP.runner.open(lesson, profileId) draws into #lesson-runner.
 * SP.runner.close() stops sound and clears the runner.
 * Safari rule: every sound starts inside a tap handler. Begin, Next, Try again, Do it again,
 * the exercise grid buttons, and Back to exercise draw the exercise and play its clip
 * in the same handler, with no await.
 * The code never logs the Azure key.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  SP.addText({
    en: {
      runExercisesIn: 'This lesson has {n} exercises.',
      runPassedSoFar: '{passed} of {total} passed so far.',
      runStart: 'Start',
      runNeedKey: 'Add the Azure key and the region in Settings first. The voices and the speech scores need them.',
      runGoSettings: 'Go to Settings',
      runLoadingVoices: 'Loading voices {done} of {total}',
      runLoadingStart: 'Loading voices…',
      runRetry: 'Retry',
      runReady: 'The voices are ready. Tap Begin. The first sound plays.',
      runBegin: 'Begin',
      runExerciseOf: 'Exercise {n} of {m}',
      runReplay: 'Replay',
      runSlow: 'Slow replay',
      runShowEnglish: 'Show English',
      runPassed: 'Correct.',
      runFailed: 'Not correct yet.',
      runMeaning: 'English: {text}',
      runTryAgain: 'Try again',
      runNext: 'Next',
      runFinish: 'Finish',
      runDone: 'Lesson done',
      runPassedInRun: 'You passed {passed} of {total} exercises in this run.',
      runAgain: 'Do it again',
      runBackToLessons: 'Back to lessons',
      runMissingType: 'This tool cannot show the exercise type "{type}". Tap Next to skip it.',
      runModuleError: 'This exercise has an error. Tap Next to skip it.',
      runJumpTitle: 'Or choose an exercise',
      runExercisesBtn: 'Exercises',
      runBackToExercise: 'Back to exercise {n}',
      runJumpPassedLabel: 'passed'
    },
    es: {
      runExercisesIn: 'Esta lección tiene {n} ejercicios.',
      runPassedSoFar: '{passed} de {total} aprobados hasta ahora.',
      runStart: 'Empezar',
      runNeedKey: 'Primero agrega la clave y la región de Azure en Ajustes. Las voces y las puntuaciones las necesitan.',
      runGoSettings: 'Ir a Ajustes',
      runLoadingVoices: 'Cargando voces {done} de {total}',
      runLoadingStart: 'Cargando voces…',
      runRetry: 'Reintentar',
      runReady: 'Las voces están listas. Toca Comenzar. Se reproduce el primer sonido.',
      runBegin: 'Comenzar',
      runExerciseOf: 'Ejercicio {n} de {m}',
      runReplay: 'Repetir audio',
      runSlow: 'Audio lento',
      runShowEnglish: 'Show English',
      runPassed: 'Correcto.',
      runFailed: 'Todavía no es correcto.',
      runMeaning: 'English: {text}',
      runTryAgain: 'Intentar de nuevo',
      runNext: 'Siguiente',
      runFinish: 'Terminar',
      runDone: 'Lección terminada',
      runPassedInRun: 'Aprobaste {passed} de {total} ejercicios en esta ronda.',
      runAgain: 'Hacerla otra vez',
      runBackToLessons: 'Volver a las lecciones',
      runMissingType: 'La herramienta no puede mostrar el tipo de ejercicio "{type}". Toca Siguiente para saltarlo.',
      runModuleError: 'Este ejercicio tiene un error. Toca Siguiente para saltarlo.',
      runJumpTitle: 'O elige un ejercicio',
      runExercisesBtn: 'Ejercicios',
      runBackToExercise: 'Volver al ejercicio {n}',
      runJumpPassedLabel: 'aprobado'
    }
  });

  // The state of the open lesson. It is null when the runner is closed.
  var state = null;
  // This number grows on every open and close. A late answer from an old run is ignored.
  var runId = 0;

  // ---------- Small helpers ----------

  // Return the element that holds the runner.
  function root() { return document.getElementById('lesson-runner'); }

  // Return the interface text for a key in the language of the open lesson.
  function t(key, vars) { return SP.t(key, state.lang, vars); }

  // Make an element with a class name and text.
  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined) { el.textContent = text; }
    return el;
  }

  // Make a button with a click function.
  function makeButton(text, onClick, secondary) {
    var button = make('button', secondary ? 'secondary' : '', text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  // Clear the runner and return it.
  function clearRoot() {
    var el = root();
    el.innerHTML = '';
    return el;
  }

  // Return true if this run is still the open run.
  function isCurrent(id) { return state !== null && id === runId; }

  // ---------- Leaving an exercise ----------

  // Stop the sound and the module of the exercise that is open.
  function leaveExercise() {
    if (!state) { return; }
    state.attempt += 1;
    var handle = state.handle;
    state.handle = null;
    if (handle && typeof handle.cleanup === 'function') {
      try { handle.cleanup(); } catch (e) { /* the module failed; go on */ }
    }
    SP.audio.stop();
  }

  // ---------- Start view ----------

  // Draw the first view: the number of exercises and the Start button.
  function showStart() {
    var box = clearRoot();
    var total = state.lesson.exercises.length;
    var counts = SP.lessons.countPassed(state.lesson, SP.storage.getProgress(state.profileId));
    box.appendChild(make('p', '', t('runExercisesIn', { n: total })));
    box.appendChild(make('p', 'note', t('runPassedSoFar', { passed: counts.passed, total: counts.total })));
    box.appendChild(make('p', 'status', '')).setAttribute('role', 'status');
    var row = make('div', 'row');
    row.appendChild(makeButton(t('runStart'), onStart));
    box.appendChild(row);
  }

  // Show the message about the missing key and a button to Settings.
  function showNeedKey() {
    var box = clearRoot();
    box.appendChild(make('p', 'warn', t('runNeedKey')));
    var row = make('div', 'row');
    row.appendChild(makeButton(t('runGoSettings'), function () { location.hash = 'settings'; }));
    box.appendChild(row);
  }

  // Show a voice loading error and a Retry button.
  function showPrepareError(error) {
    var box = clearRoot();
    var message = make('p', 'status error', SP.audio.errorText(error, state.lang));
    message.setAttribute('role', 'status');
    box.appendChild(message);
    var row = make('div', 'row');
    row.appendChild(makeButton(t('runRetry'), onStart));
    box.appendChild(row);
  }

  // Show the Begin button. A tap is needed to play the first sound.
  function showBegin() {
    var box = clearRoot();
    box.appendChild(make('p', '', t('runReady')));
    var row = make('div', 'row');
    row.appendChild(makeButton(t('runBegin'), beginLesson));
    box.appendChild(row);
    appendJumpGrid(box, null);
  }

  // Load the voice clips of the lesson. Show the progress.
  function onStart() {
    if (!SP.storage.hasCredentials()) { showNeedKey(); return; }
    var id = runId;
    var box = clearRoot();
    var status = make('p', 'status', t('runLoadingStart'));
    status.setAttribute('role', 'status');
    box.appendChild(status);
    SP.audio.prepareLesson(state.lesson, function (done, total) {
      if (isCurrent(id)) { status.textContent = t('runLoadingVoices', { done: done, total: total }); }
    }, function () { return isCurrent(id); }).then(function (result) {
      if (!isCurrent(id)) { return; }
      if (result && result.ok) { showBegin(); } else { showPrepareError(result ? result.error : 'other'); }
    }, function () {
      if (isCurrent(id)) { showPrepareError('other'); }
    });
  }

  // Start at the first exercise. This runs inside the tap on Begin.
  function beginLesson() {
    state.started = false;
    startAt(0);
  }

  // Start at one exercise. Reset the run only if it has not started. Runs inside a tap.
  function startAt(index) {
    if (!state.started) {
      state.passedNow = {};
      state.started = true;
    }
    showExercise(index);
  }

  // ---------- Exercise grid ----------

  // The text key of each exercise type name.
  var TYPE_KEYS = {
    listen_choose: 'typeListenChoose',
    listen_type: 'typeListenType',
    repeat: 'typeRepeat',
    read_aloud: 'typeReadAloud'
  };

  // Return the name of an exercise type in the interface language.
  function typeName(type) {
    return Object.prototype.hasOwnProperty.call(TYPE_KEYS, type) ? t(TYPE_KEYS[type]) : String(type);
  }

  // Return true if the profile passed the exercise before or in this run.
  function isPassed(exercise, index, progress) {
    var record = progress[exercise.exerciseId];
    return Boolean((record && record.passes > 0) || state.passedNow[index]);
  }

  // Make the button for one exercise. It shows the number and the type, never the sentence.
  function makeJumpButton(index, progress, currentIndex) {
    var exercise = state.lesson.exercises[index];
    var passed = isPassed(exercise, index, progress);
    var button = makeButton('', function () { startAt(index); }, true);
    button.className = 'secondary run-jump' + (passed ? ' run-jump-passed' : '') +
      (index === currentIndex ? ' run-jump-current' : '');
    var label = t('exerciseNumber', { n: index + 1 }) + ', ' + typeName(exercise.type);
    button.setAttribute('aria-label', label + (passed ? ', ' + t('runJumpPassedLabel') : ''));
    if (index === currentIndex) { button.setAttribute('aria-current', 'true'); }
    button.appendChild(make('span', 'run-jump-num', String(index + 1)));
    button.appendChild(make('span', 'run-jump-type', typeName(exercise.type)));
    if (passed) {
      var check = make('span', 'run-jump-check', '\u2713');
      check.setAttribute('aria-hidden', 'true');
      button.appendChild(check);
    }
    return button;
  }

  // Add the heading and the grid of exercise buttons. currentIndex is null before the run.
  function appendJumpGrid(box, currentIndex) {
    var progress = SP.storage.getProgress(state.profileId) || {};
    box.appendChild(make('h2', '', t('runJumpTitle')));
    var grid = make('div', 'run-jump-grid');
    state.lesson.exercises.forEach(function (exercise, index) {
      grid.appendChild(makeJumpButton(index, progress, currentIndex));
    });
    box.appendChild(grid);
  }

  // Show the grid during a run, with a button back to the current exercise.
  function showJumpView() {
    var box = clearRoot();
    var row = make('div', 'row');
    row.appendChild(makeButton(t('runBackToExercise', { n: state.index + 1 }), function () {
      showExercise(state.index);
    }));
    box.appendChild(row);
    appendJumpGrid(box, state.index);
  }

  // Make the line with "Exercise N of M" and the Exercises button.
  function makeExerciseHeader(index, total) {
    var head = make('div', 'run-head');
    head.appendChild(make('p', 'run-count', t('runExerciseOf', { n: index + 1, m: total })));
    head.appendChild(makeButton(t('runExercisesBtn'), function () {
      leaveExercise();
      showJumpView();
    }, true));
    return head;
  }

  // ---------- Progress ----------

  // Return a score only if it is a number.
  function numberOrNull(value) {
    return (typeof value === 'number' && isFinite(value)) ? value : null;
  }

  // Save the result of one attempt in the progress of the profile.
  function saveAttempt(exercise, outcome, hintUsed) {
    var passed = Boolean(outcome.passed);
    var scores = outcome.scores || {};
    SP.storage.updateExercise(state.profileId, exercise.exerciseId, function (old) {
      var last = { passed: passed, at: new Date().toISOString() };
      ['accuracy', 'fluency', 'pron'].forEach(function (name) {
        var value = numberOrNull(scores[name]);
        if (value !== null) { last[name] = value; }
      });
      return Object.assign({}, old, {
        attempts: (old.attempts || 0) + 1,
        passes: (old.passes || 0) + (passed ? 1 : 0),
        hints: (old.hints || 0) + (hintUsed ? 1 : 0),
        last: last
      });
    });
  }

  // ---------- Exercise view ----------

  // Make the progress bar for the exercise.
  function makeProgressBar(index, total) {
    var bar = make('div', 'run-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(index));
    var fill = make('div', 'run-bar-fill');
    fill.style.width = Math.round((index / total) * 100) + '%';
    bar.appendChild(fill);
    return bar;
  }

  // Make the row with the Replay and Slow replay buttons.
  function makeAudioRow(exercise) {
    var row = make('div', 'row run-audio');
    row.appendChild(makeButton(t('runReplay'), function () { SP.audio.play(exercise, false); }, true));
    row.appendChild(makeButton(t('runSlow'), function () { SP.audio.play(exercise, true); }, true));
    return row;
  }

  // Make the Show English button and the hidden English text. The first tap counts one hint.
  function makeEnglishBlock(exercise, view) {
    var block = make('div', 'run-english');
    var text = make('p', 'run-english-text', exercise.meaningEn);
    text.hidden = true;
    var button = makeButton(t('runShowEnglish'), function () {
      state.hintUsed = true;
      text.hidden = false;
      button.hidden = true;
    }, true);
    block.appendChild(button);
    block.appendChild(text);
    return block;
  }

  // Make the result panel. It stays hidden until the exercise ends.
  function makeResultPanel() {
    var panel = make('div', 'run-result');
    panel.hidden = true;
    return panel;
  }

  // Fill the result panel after the answer.
  function fillResult(panel, exercise, outcome) {
    panel.innerHTML = '';
    var passed = Boolean(outcome.passed);
    var verdict = make('p', 'run-verdict ' + (passed ? 'run-pass' : 'run-fail'), t(passed ? 'runPassed' : 'runFailed'));
    verdict.setAttribute('role', 'status');
    panel.appendChild(verdict);
    if (!outcome.textShown) {
      var spanish = make('p', 'run-spanish', exercise.text);
      spanish.setAttribute('lang', 'es');
      panel.appendChild(spanish);
    }
    if (state.lang === 'en' && exercise.meaningEn) {
      panel.appendChild(make('p', 'run-meaning', t('runMeaning', { text: exercise.meaningEn })));
    }
    var note = exercise.note && exercise.note[state.lang];
    if (note) { panel.appendChild(make('p', 'note run-note', note)); }
    panel.hidden = false;
  }

  // Make the Try again and Next buttons. They stay hidden until the exercise ends.
  function makeNavRow(index, total, withTryAgain) {
    var row = make('div', 'row run-nav');
    row.hidden = true;
    if (withTryAgain) {
      row.appendChild(makeButton(t('runTryAgain'), function () { showExercise(index); }, true));
    }
    var last = (index + 1 >= total);
    row.appendChild(makeButton(t(last ? 'runFinish' : 'runNext'), function () {
      if (last) { showEnd(); } else { showExercise(index + 1); }
    }));
    return row;
  }

  // Handle the end of one attempt: save progress and show the result and the buttons.
  function onFinish(attemptId, exercise, view, outcome) {
    if (!state || attemptId !== state.attempt || state.finished) { return; }
    state.finished = true;
    var result = outcome || {};
    saveAttempt(exercise, result, state.hintUsed);
    // "Passed in this run" means passed at least one time.
    state.passedNow[state.index] = state.passedNow[state.index] || Boolean(result.passed);
    if (view.english) { view.english.hidden = true; }
    fillResult(view.result, exercise, result);
    view.nav.hidden = false;
    if (view.result.scrollIntoView) { view.result.scrollIntoView({ block: 'nearest' }); }
  }

  // Show a message in the exercise area for an exercise that cannot run. Allow Next.
  function showBrokenExercise(view, key, vars) {
    view.area.appendChild(make('p', 'warn', t(key, vars)));
    view.nav.hidden = false;
  }

  // Start the module of the exercise type inside the area.
  function startModule(exercise, view) {
    var module = SP.exerciseTypes && SP.exerciseTypes[exercise.type];
    if (!module || typeof module.render !== 'function') {
      showBrokenExercise(view, 'runMissingType', { type: exercise.type });
      return false;
    }
    var attemptId = state.attempt;
    var ctx = {
      exercise: exercise,
      lesson: state.lesson,
      lang: state.lang,
      t: function (key, vars) { return SP.t(key, state.lang, vars); },
      area: view.area,
      playAudio: function (slow) { SP.audio.play(exercise, Boolean(slow)); },
      finish: function (outcome) { onFinish(attemptId, exercise, view, outcome); }
    };
    try {
      state.handle = module.render(ctx) || null;
    } catch (e) {
      state.handle = null;
      view.area.innerHTML = '';
      showBrokenExercise(view, 'runModuleError');
      return false;
    }
    return true;
  }

  // Draw one exercise and play its clip. Every caller is a tap handler, so no await comes before the sound.
  function showExercise(index) {
    leaveExercise();
    var exercise = state.lesson.exercises[index];
    var total = state.lesson.exercises.length;
    state.index = index;
    state.finished = false;
    state.hintUsed = false;
    var needsAudio = SP.audio.needsAudio(exercise);
    var typeKnown = Boolean(SP.exerciseTypes && SP.exerciseTypes[exercise.type]);

    var box = clearRoot();
    var view = { area: make('div', 'run-area'), result: makeResultPanel(), english: null };
    box.appendChild(makeExerciseHeader(index, total));
    box.appendChild(makeProgressBar(index, total));
    if (needsAudio && typeKnown) { box.appendChild(makeAudioRow(exercise)); }
    // An optional picture shows the meaning (not for listen_choose, which has its own pictures).
    if (exercise.image && exercise.type !== 'listen_choose') {
      var picture = make('img', 'run-image');
      picture.src = exercise.image;
      picture.alt = '';
      box.appendChild(picture);
    }
    box.appendChild(view.area);
    if (state.lang === 'en' && exercise.meaningEn && typeKnown) {
      view.english = makeEnglishBlock(exercise, view);
      box.appendChild(view.english);
    }
    box.appendChild(view.result);
    view.nav = makeNavRow(index, total, typeKnown);
    box.appendChild(view.nav);

    var started = startModule(exercise, view);
    if (started && needsAudio) { SP.audio.play(exercise, false); }
  }

  // ---------- End view ----------

  // Count the exercises that passed in this run.
  function countPassedNow() {
    return Object.keys(state.passedNow).filter(function (key) { return state.passedNow[key]; }).length;
  }

  // Show the end of the lesson.
  function showEnd() {
    leaveExercise();
    var box = clearRoot();
    var total = state.lesson.exercises.length;
    box.appendChild(make('h2', '', t('runDone')));
    box.appendChild(make('p', '', t('runPassedInRun', { passed: countPassedNow(), total: total })));
    var row = make('div', 'row');
    row.appendChild(makeButton(t('runAgain'), beginLesson));
    row.appendChild(makeButton(t('runBackToLessons'), function () { location.hash = 'lessons'; }, true));
    box.appendChild(row);
  }

  // ---------- Public functions ----------

  // Open a lesson for a profile and show the start view.
  function open(lesson, profileId) {
    close();
    runId += 1;
    state = {
      lesson: lesson,
      profileId: profileId,
      lang: SP.storage.getProfile(profileId).explanationLang,
      index: 0,
      attempt: 0,
      handle: null,
      finished: false,
      hintUsed: false,
      started: false,
      passedNow: {}
    };
    showStart();
  }

  // Stop the sound and the module. Clear the runner.
  function close() {
    leaveExercise();
    SP.audio.stop();
    runId += 1;
    state = null;
    var el = root();
    if (el) { el.innerHTML = ''; }
  }

  SP.runner = { open: open, close: close };
}());
