/* config.js - fixed values for the whole tool.
 * Other files read these values from SP.config.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  SP.config = {
    // Every name in browser storage starts with this text.
    storagePrefix: 'spanish-',
    // The two profiles of the tool.
    profiles: ['cade', 'casey'],
    // The name that the tool shows for each profile.
    profileNames: { cade: 'Cade', casey: 'Casey' },
    // The first explanation language of each profile.
    defaultExplanationLang: { cade: 'en', casey: 'es' },
    // The language code for voices and speech scores.
    language: 'es-MX',
    // The Azure voices that the tool can use.
    voices: ['es-MX-DaliaNeural', 'es-MX-JorgeNeural'],
    // The voice that the tool uses when an exercise names no voice.
    defaultVoice: 'es-MX-DaliaNeural',
    // The speed of the slow replay (1 is normal speed).
    slowRate: 0.70,
    // The silence time in milliseconds that ends a recording.
    silenceTimeoutMs: 1000,
    // The default pass values for a scored exercise.
    pass: { accuracy: 75, fluency: 70 },
    // The lowest word score for each color. Below yellow is red.
    wordColors: { green: 80, yellow: 60 },
    // The largest number of exercises in one lesson.
    maxExercises: 15,
    // The exercise types that a lesson file can use.
    exerciseTypes: ['listen_choose', 'listen_type', 'repeat', 'read_aloud'],
    // The version number of the progress backup file.
    backupVersion: 1
  };
}());
