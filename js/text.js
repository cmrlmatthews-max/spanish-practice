/* text.js - all interface text in English and in Spanish.
 * SP.t(key, lang, vars) returns the text for one key.
 * A {name} marker in a text is replaced with the value in vars.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  var en = {
    appTitle: 'Spanish practice',
    chooseProfile: 'Choose your profile',
    chooseProfileHint: 'Tap your name to start.',
    settings: 'Settings',
    lessons: 'Lessons',
    back: 'Back',
    save: 'Save',
    saved: 'Saved on this device.',
    profile: 'Profile',
    explanationLang: 'Explanation language',
    langEnglish: 'English',
    langSpanish: 'Español',
    azureKey: 'Azure key',
    keySavedPlaceholder: 'Key saved on this device',
    keyEmptyPlaceholder: 'Paste the key here',
    azureRegion: 'Azure region',
    regionHint: 'Example: eastus',
    deleteKey: 'Delete key',
    keyDeleted: 'The key is gone from this device.',
    keyMissing: 'Type the Azure key and the region. Then tap Save.',
    saveNeedsBoth: 'Type the key and the region. Then tap Save.',
    saveFailed: 'Safari cannot save the settings. Turn off Private Browsing and try again.',
    privacyTitle: 'Privacy',
    privacyNote: 'The tool sends your voice recordings to Microsoft for speech scores. The tool keeps no recordings. The key stays in this browser only.',
    homeScreenTip: 'Add this page to the Home Screen on iPhone and iPad. Safari then keeps your data.',
    backupTitle: 'Progress backup',
    backupHint: 'The file has your progress. It does not have the key.',
    backupSave: 'Save backup file',
    backupLoad: 'Load backup file',
    backupSaved: 'The backup file is ready.',
    backupLoaded: 'The progress is loaded.',
    backupWrongProfile: 'This file is for the profile {profile}. Choose that profile first.',
    backupBadFile: 'This file is not a valid backup file.',
    backupWrongVersion: 'This backup file has a different version. The tool cannot load it.',
    backupConfirmReplace: 'Loading this file replaces the progress on this device.',
    backupConfirmYes: 'Replace progress',
    cancel: 'Cancel',
    storageBlocked: 'Safari cannot save data. Turn off Private Browsing. The tool works, but it forgets your data when you close the page.',
    lessonsLoading: 'Loading the lessons...',
    lessonsNone: 'There are no lessons for this profile yet.',
    lessonsLoadError: 'The tool cannot load the lessons. Check the network. Then try again.',
    retry: 'Retry',
    lessonFileProblems: 'Lesson file problems: {count}',
    stage: 'Stage {n}',
    passedCount: '{passed} of {total} passed',
    exercises: 'Exercises',
    exercisesNotReady: 'The exercises are not ready yet. They come in the next version.',
    exerciseNumber: 'Exercise {n}',
    typeListenChoose: 'Listen and choose',
    typeListenType: 'Listen and type',
    typeRepeat: 'Repeat',
    typeReadAloud: 'Read aloud'
  };

  var es = {
    appTitle: 'Práctica de español',
    chooseProfile: 'Elige tu perfil',
    chooseProfileHint: 'Toca tu nombre para empezar.',
    settings: 'Ajustes',
    lessons: 'Lecciones',
    back: 'Atrás',
    save: 'Guardar',
    saved: 'Guardado en este dispositivo.',
    profile: 'Perfil',
    explanationLang: 'Idioma de las explicaciones',
    langEnglish: 'English',
    langSpanish: 'Español',
    azureKey: 'Clave de Azure',
    keySavedPlaceholder: 'Clave guardada en este dispositivo',
    keyEmptyPlaceholder: 'Pega la clave aquí',
    azureRegion: 'Región de Azure',
    regionHint: 'Ejemplo: eastus',
    deleteKey: 'Borrar la clave',
    keyDeleted: 'La clave ya no está en este dispositivo.',
    keyMissing: 'Escribe la clave y la región de Azure. Luego toca Guardar.',
    saveNeedsBoth: 'Escribe la clave y la región. Luego toca Guardar.',
    saveFailed: 'Safari no puede guardar los ajustes. Desactiva la navegación privada e inténtalo de nuevo.',
    privacyTitle: 'Privacidad',
    privacyNote: 'La herramienta envía tus grabaciones de voz a Microsoft para calcular las puntuaciones de pronunciación. No guarda ninguna grabación. La clave se queda solo en este navegador.',
    homeScreenTip: 'Agrega esta página a la pantalla de inicio en iPhone y iPad. Así Safari conserva tus datos.',
    backupTitle: 'Copia de seguridad del progreso',
    backupHint: 'El archivo contiene tu progreso, no la clave.',
    backupSave: 'Guardar archivo de copia',
    backupLoad: 'Cargar archivo de copia',
    backupSaved: 'El archivo de copia está listo.',
    backupLoaded: 'El progreso se cargó.',
    backupWrongProfile: 'Este archivo es del perfil {profile}. Elige ese perfil primero.',
    backupBadFile: 'Este archivo no es una copia de seguridad válida.',
    backupWrongVersion: 'Este archivo tiene otra versión. La herramienta no puede cargarlo.',
    backupConfirmReplace: 'Al cargar este archivo se reemplaza el progreso de este dispositivo.',
    backupConfirmYes: 'Reemplazar progreso',
    cancel: 'Cancelar',
    storageBlocked: 'Safari no puede guardar datos. Desactiva la navegación privada. La herramienta funciona, pero olvida tus datos al cerrar la página.',
    lessonsLoading: 'Cargando las lecciones…',
    lessonsNone: 'Todavía no hay lecciones para este perfil.',
    lessonsLoadError: 'No se pudieron cargar las lecciones. Revisa la conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
    lessonFileProblems: 'Lesson file problems: {count}',
    stage: 'Etapa {n}',
    passedCount: '{passed} de {total} aprobados',
    exercises: 'Ejercicios',
    exercisesNotReady: 'Los ejercicios todavía no están listos. Llegan en la próxima versión.',
    exerciseNumber: 'Ejercicio {n}',
    typeListenChoose: 'Escuchar y elegir',
    typeListenType: 'Escuchar y escribir',
    typeRepeat: 'Repetir',
    typeReadAloud: 'Leer en voz alta'
  };

  SP.text = { en: en, es: es };

  // Add more texts. Other files call this with {en: {...}, es: {...}}.
  SP.addText = function (more) {
    ['en', 'es'].forEach(function (lang) {
      if (more && more[lang]) { Object.assign(SP.text[lang], more[lang]); }
    });
  };

  // Return the text for a key in a language.
  // Use English if the language lacks the key. Use the key itself if English lacks it too.
  SP.t = function (key, lang, vars) {
    var table = SP.text[lang] || {};
    var text = table[key];
    if (typeof text !== 'string') { text = SP.text.en[key]; }
    if (typeof text !== 'string') { text = key; }
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split('{' + name + '}').join(String(vars[name]));
      });
    }
    return text;
  };
}());
