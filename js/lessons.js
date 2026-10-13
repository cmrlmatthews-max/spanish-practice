/* lessons.js - load, check, and filter the lesson files.
 * The list of files is in lessons/index.json.
 * Error messages in this file are English text for the maintainer.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  var LESSON_FIELDS = ['lessonId', 'level', 'unit', 'stage', 'title', 'titleEn', 'audience', 'language', 'exercises'];
  var EXERCISE_FIELDS = ['exerciseId', 'type', 'text', 'meaningEn', 'choices', 'image', 'voice', 'note', 'pass', 'glosses'];
  var CHOICE_FIELDS = ['image', 'label', 'correct'];
  var NOTE_FIELDS = ['en', 'es'];
  var PASS_FIELDS = ['accuracy', 'fluency'];
  var GLOSS_MAX_LENGTH = 80;
  // Punctuation that wordKey removes at the ends of a word. A gloss key has none of these.
  var EDGE_PUNCTUATION = /^[¿?¡!.,;:"«»]+|[¿?¡!.,;:"«»]+$/g;
  var ANY_PUNCTUATION = /[¿?¡!.,;:"«»]/;

  // ---------- Small checks ----------

  // Return the lookup key of a word: lower case, no punctuation at the ends.
  function wordKey(text) {
    return String(text).toLowerCase().replace(EDGE_PUNCTUATION, '');
  }

  // Return the list of word keys in a sentence.
  function textWordKeys(text) {
    return String(text).split(/\s+/).map(wordKey).filter(function (key) { return key !== ''; });
  }

  // Return true if the value is a plain object.
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Return true if the value is a text with at least one visible character.
  function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  // Return true if the value is a whole number.
  function isWhole(value) {
    return typeof value === 'number' && Number.isInteger(value);
  }

  // Add an error for each field of the object that is not in the allowed list.
  function checkFields(obj, allowed, where, errors) {
    Object.keys(obj).forEach(function (name) {
      if (allowed.indexOf(name) === -1) { errors.push(where + ': field "' + name + '" is not allowed.'); }
    });
  }

  // ---------- Checks for one lesson ----------

  // Check the lesson fields (not the exercises). Return the lesson id parts or null.
  function checkLessonFields(lesson, fileName, errors) {
    var parts = null;
    if (typeof lesson.lessonId !== 'string' || !/^\d+\.\d+\.\d+$/.test(lesson.lessonId)) {
      errors.push('lessonId must be text like "1.2.3".');
    } else {
      parts = lesson.lessonId.split('.').map(Number);
      if (fileName !== 'lesson-' + lesson.lessonId + '.json') {
        errors.push('The file name must be "lesson-' + lesson.lessonId + '.json".');
      }
    }
    if (!isWhole(lesson.level) || (parts && lesson.level !== parts[0])) {
      errors.push('level must be a whole number. It must match the first part of lessonId.');
    }
    if (!isWhole(lesson.unit) || (parts && lesson.unit !== parts[1])) {
      errors.push('unit must be a whole number. It must match the second part of lessonId.');
    }
    if (!isWhole(lesson.stage) || lesson.stage < 1 || lesson.stage > 4) {
      errors.push('stage must be a whole number from 1 to 4.');
    }
    if (!isText(lesson.title)) { errors.push('title must be a text that is not empty.'); }
    if (!isText(lesson.titleEn)) { errors.push('titleEn must be a text that is not empty.'); }
    checkAudience(lesson.audience, errors);
    if (lesson.language !== 'es-MX') { errors.push('language must be "es-MX".'); }
    return parts;
  }

  // Check the audience list.
  function checkAudience(audience, errors) {
    if (!Array.isArray(audience) || audience.length === 0) {
      errors.push('audience must be a list with at least one profile.');
      return;
    }
    var seen = [];
    audience.forEach(function (id) {
      if (SP.config.profiles.indexOf(id) === -1) { errors.push('audience: "' + id + '" is not a profile.'); }
      if (seen.indexOf(id) !== -1) { errors.push('audience: "' + id + '" is in the list two times.'); }
      seen.push(id);
    });
  }

  // Check the four choices of a listen_choose exercise.
  function checkChoices(choices, where, errors) {
    if (!Array.isArray(choices) || choices.length !== 4) {
      errors.push(where + ': choices must be a list of exactly 4 items.');
      return;
    }
    var correctCount = 0;
    choices.forEach(function (choice, i) {
      var name = where + ' choice ' + (i + 1);
      if (!isObject(choice)) { errors.push(name + ': must be an object.'); return; }
      checkFields(choice, CHOICE_FIELDS, name, errors);
      if (!isText(choice.image)) { errors.push(name + ': image must be a text that is not empty.'); }
      if (!isText(choice.label)) { errors.push(name + ': label must be a text that is not empty.'); }
      if (typeof choice.correct !== 'boolean') { errors.push(name + ': correct must be true or false.'); }
      if (choice.correct === true) { correctCount += 1; }
    });
    if (correctCount !== 1) { errors.push(where + ': exactly one choice must have correct set to true.'); }
  }

  // Check the optional note of an exercise.
  function checkNote(note, where, errors) {
    if (!isObject(note)) { errors.push(where + ': note must be an object.'); return; }
    checkFields(note, NOTE_FIELDS, where + ' note', errors);
    NOTE_FIELDS.forEach(function (lang) {
      if (!isText(note[lang])) { errors.push(where + ': note.' + lang + ' must be a text that is not empty.'); }
    });
  }

  // Check the optional pass values of an exercise.
  function checkPass(pass, where, errors) {
    if (!isObject(pass)) { errors.push(where + ': pass must be an object.'); return; }
    checkFields(pass, PASS_FIELDS, where + ' pass', errors);
    PASS_FIELDS.forEach(function (name) {
      var v = pass[name];
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100) {
        errors.push(where + ': pass.' + name + ' must be a number from 0 to 100.');
      }
    });
  }

  // Check the exerciseId and return its text.
  function checkExerciseId(ex, lessonId, where, seenIds, errors) {
    var ok = typeof ex.exerciseId === 'string' && typeof lessonId === 'string' &&
      ex.exerciseId.indexOf(lessonId + '.') === 0 &&
      /^[1-9]\d*$/.test(ex.exerciseId.slice(lessonId.length + 1));
    if (!ok) { errors.push(where + ': exerciseId must be the lessonId, a dot, and a number of 1 or more.'); }
    if (seenIds.indexOf(ex.exerciseId) !== -1) { errors.push(where + ': exerciseId is used two times.'); }
    seenIds.push(ex.exerciseId);
  }

  // Check the text of one gloss key. Return an error text or null.
  function glossKeyProblem(key, words) {
    if (key === '' || /\s/.test(key)) { return 'must not be empty and must not have spaces'; }
    if (key !== key.toLowerCase()) { return 'must be in lower case'; }
    if (ANY_PUNCTUATION.test(key)) { return 'must not have punctuation'; }
    if (words.indexOf(key) === -1) { return 'is not a word of the text'; }
    return null;
  }

  // Check the optional glosses of an exercise.
  function checkGlosses(glosses, ex, where, errors) {
    if (!isObject(glosses)) { errors.push(where + ': glosses must be an object.'); return; }
    var words = textWordKeys(ex.text);
    Object.keys(glosses).forEach(function (key) {
      var problem = glossKeyProblem(key, words);
      if (problem) { errors.push(where + ': glosses key "' + key + '" ' + problem + '.'); }
      var value = glosses[key];
      if (!isText(value) || value.length > GLOSS_MAX_LENGTH) {
        errors.push(where + ': glosses "' + key + '" must be a text of 1 to ' + GLOSS_MAX_LENGTH + ' characters.');
      }
    });
  }

  // Check the fields that depend on the exercise type.
  function checkTypeFields(ex, where, errors) {
    var isChoose = ex.type === 'listen_choose';
    if (isChoose) {
      checkChoices(ex.choices, where, errors);
    } else if (ex.choices !== undefined) {
      errors.push(where + ': choices is only for listen_choose.');
    }
    if (ex.image !== undefined) {
      if (isChoose) { errors.push(where + ': image is not for listen_choose.'); }
      else if (!isText(ex.image)) { errors.push(where + ': image must be a text that is not empty.'); }
    }
    if (ex.pass !== undefined) {
      if (ex.type !== 'repeat' && ex.type !== 'read_aloud') {
        errors.push(where + ': pass is only for repeat and read_aloud.');
      } else {
        checkPass(ex.pass, where, errors);
      }
    }
  }

  // Check one exercise.
  function checkExercise(ex, index, lessonId, seenIds, errors) {
    var where = 'Exercise ' + (index + 1);
    if (!isObject(ex)) { errors.push(where + ': must be an object.'); return; }
    checkFields(ex, EXERCISE_FIELDS, where, errors);
    checkExerciseId(ex, lessonId, where, seenIds, errors);
    if (SP.config.exerciseTypes.indexOf(ex.type) === -1) {
      errors.push(where + ': type must be one of ' + SP.config.exerciseTypes.join(', ') + '.');
    }
    if (!isText(ex.text)) { errors.push(where + ': text must be a text that is not empty.'); }
    if (!isText(ex.meaningEn)) { errors.push(where + ': meaningEn must be a text that is not empty.'); }
    checkTypeFields(ex, where, errors);
    if (ex.voice !== undefined && (typeof ex.voice !== 'string' || ex.voice.indexOf('es-MX-') !== 0)) {
      errors.push(where + ': voice must be a text that starts with "es-MX-".');
    }
    if (ex.note !== undefined) { checkNote(ex.note, where, errors); }
    if (ex.glosses !== undefined) { checkGlosses(ex.glosses, ex, where, errors); }
  }

  // Check a whole lesson. Return a list of English error messages. An empty list means valid.
  function validateLesson(lesson, fileName) {
    var errors = [];
    if (!isObject(lesson)) { return ['The lesson file must hold one object.']; }
    checkFields(lesson, LESSON_FIELDS, 'Lesson', errors);
    checkLessonFields(lesson, fileName, errors);
    if (!Array.isArray(lesson.exercises) || lesson.exercises.length < 1 || lesson.exercises.length > SP.config.maxExercises) {
      errors.push('exercises must be a list of 1 to ' + SP.config.maxExercises + ' items.');
      return errors;
    }
    var seenIds = [];
    lesson.exercises.forEach(function (ex, i) {
      checkExercise(ex, i, lesson.lessonId, seenIds, errors);
    });
    return errors;
  }

  // ---------- Loading ----------

  // Fetch one JSON file. Throw an Error if the fetch or the JSON fails.
  async function fetchJson(path) {
    var response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) { throw new Error('HTTP ' + response.status); }
    return response.json();
  }

  // Load and check one lesson file. Return {file, lesson} or {file, messages}.
  async function loadOne(file) {
    if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+\.json$/.test(file)) {
      return { file: String(file), messages: ['The file name in index.json is not valid.'] };
    }
    var lesson;
    try {
      lesson = await fetchJson('lessons/' + file);
    } catch (e) {
      return { file: file, messages: ['The tool cannot read this file (' + e.message + ').'] };
    }
    var messages = validateLesson(lesson, file);
    return messages.length ? { file: file, messages: messages } : { file: file, lesson: lesson };
  }

  // Check the lessons against each other. Add errors to the later file.
  // Return the lessons without errors, in order.
  function checkAcross(results, errors) {
    var ids = {};
    var stages = {};
    var good = [];
    results.forEach(function (r) {
      if (!r.lesson) { errors.push({ file: r.file, messages: r.messages }); return; }
      var lesson = r.lesson;
      var messages = [];
      if (ids[lesson.lessonId]) { messages.push('lessonId "' + lesson.lessonId + '" is already in ' + ids[lesson.lessonId] + '.'); }
      if (stages[lesson.level] !== undefined && stages[lesson.level] !== lesson.stage) {
        messages.push('Level ' + lesson.level + ' uses stage ' + stages[lesson.level] + ' in an earlier file. This file has stage ' + lesson.stage + '.');
      }
      if (messages.length) { errors.push({ file: r.file, messages: messages }); return; }
      ids[lesson.lessonId] = r.file;
      if (stages[lesson.level] === undefined) { stages[lesson.level] = lesson.stage; }
      good.push(lesson);
    });
    return good;
  }

  // Load all lessons. Throw an Error if index.json fails.
  // Return {lessons, errors}.
  async function loadAll() {
    var index = await fetchJson('lessons/index.json');
    if (!isObject(index) || !Array.isArray(index.lessons)) {
      throw new Error('index.json must be {"lessons": [file names]}.');
    }
    var results = await Promise.all(index.lessons.map(loadOne));
    var errors = [];
    var lessons = checkAcross(results, errors);
    return { lessons: lessons, errors: errors };
  }

  // ---------- Use of the lessons ----------

  // Return the lessons for one profile.
  function forProfile(lessons, profileId) {
    return lessons.filter(function (lesson) { return lesson.audience.indexOf(profileId) !== -1; });
  }

  // Count the exercises that the profile passed at least one time.
  function countPassed(lesson, progress) {
    var passed = 0;
    lesson.exercises.forEach(function (ex) {
      var record = progress && progress[ex.exerciseId];
      if (record && record.passes > 0) { passed += 1; }
    });
    return { passed: passed, total: lesson.exercises.length };
  }

  SP.lessons = {
    loadAll: loadAll,
    validateLesson: validateLesson,
    forProfile: forProfile,
    countPassed: countPassed,
    wordKey: wordKey
  };
}());
