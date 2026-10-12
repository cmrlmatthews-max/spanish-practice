/* storage.js - all reads and writes of browser storage.
 * Every name starts with "spanish-". Safari can throw errors, so each call has try/catch.
 * The code never logs the Azure key. The backup never holds the key.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  var PREFIX = SP.config.storagePrefix;
  var NAME_KEY = PREFIX + 'azure-key';
  var NAME_REGION = PREFIX + 'azure-region';
  var NAME_CURRENT = PREFIX + 'current-profile';

  // Values that could not be saved stay here until the page closes.
  var memory = {};

  // Read one value. Use the memory copy if storage has no value or fails.
  function read(name) {
    var value = null;
    try { value = localStorage.getItem(name); } catch (e) { value = null; }
    if (value === null && Object.prototype.hasOwnProperty.call(memory, name)) { return memory[name]; }
    return value;
  }

  // Write one value. Return true if storage kept it. If not, keep it in memory.
  function write(name, value) {
    try {
      localStorage.setItem(name, value);
      delete memory[name];
      return true;
    } catch (e) {
      memory[name] = value;
      return false;
    }
  }

  // Remove one value from storage and from memory. Return true if storage worked.
  function remove(name) {
    delete memory[name];
    try { localStorage.removeItem(name); return true; } catch (e) { return false; }
  }

  // Check that storage works. Write a test value and remove it.
  function isAvailable() {
    var name = PREFIX + 'test';
    try {
      localStorage.setItem(name, '1');
      localStorage.removeItem(name);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Return true if the id is a known profile.
  function isProfile(id) {
    return SP.config.profiles.indexOf(id) !== -1;
  }

  // Return true if the value is a plain object (not null, not an array).
  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // ---------- Azure key and region ----------

  // Return the saved key, or an empty text.
  function getKey() { return read(NAME_KEY) || ''; }

  // Save the key. Return true if the write worked.
  function setKey(value) { return write(NAME_KEY, String(value).trim()); }

  // Remove the key. Return true if the removal worked.
  function clearKey() { return remove(NAME_KEY); }

  // Return the saved region, or an empty text.
  function getRegion() { return read(NAME_REGION) || ''; }

  // Save the region without spaces and in lower case.
  function setRegion(value) {
    return write(NAME_REGION, String(value).replace(/\s+/g, '').toLowerCase());
  }

  // Return true if both the key and the region exist.
  function hasCredentials() {
    return getKey() !== '' && getRegion() !== '';
  }

  // ---------- Current profile ----------

  // Return 'cade', 'casey', or null.
  function getCurrentProfile() {
    var id = read(NAME_CURRENT);
    return isProfile(id) ? id : null;
  }

  // Save the current profile. Return true if the write worked.
  function setCurrentProfile(id) {
    if (!isProfile(id)) { return false; }
    return write(NAME_CURRENT, id);
  }

  // ---------- Profile data ----------

  // Return a language code that the tool knows. Use the default if it is not valid.
  function cleanLang(lang, id) {
    if (lang === 'en' || lang === 'es') { return lang; }
    return SP.config.defaultExplanationLang[id];
  }

  // Return a progress object. Keep only entries that are objects.
  function cleanProgress(progress) {
    var clean = {};
    if (!isPlainObject(progress)) { return clean; }
    Object.keys(progress).forEach(function (exerciseId) {
      if (isPlainObject(progress[exerciseId])) { clean[exerciseId] = progress[exerciseId]; }
    });
    return clean;
  }

  // Return the data of a profile. The result is always valid.
  function getProfile(id) {
    var data = null;
    try { data = JSON.parse(read(PREFIX + 'profile-' + id)); } catch (e) { data = null; }
    if (!isPlainObject(data)) { data = {}; }
    return {
      explanationLang: cleanLang(data.explanationLang, id),
      progress: cleanProgress(data.progress)
    };
  }

  // Save the data of a profile. Return true if the write worked.
  function saveProfile(id, data) {
    if (!isProfile(id)) { return false; }
    var clean = {
      explanationLang: cleanLang(data.explanationLang, id),
      progress: cleanProgress(data.progress)
    };
    return write(PREFIX + 'profile-' + id, JSON.stringify(clean));
  }

  // Change the explanation language of a profile.
  function setExplanationLang(id, lang) {
    var data = getProfile(id);
    data.explanationLang = cleanLang(lang, id);
    return saveProfile(id, data);
  }

  // ---------- Progress ----------

  // Return the progress object of a profile.
  function getProgress(id) {
    return getProfile(id).progress;
  }

  // Return a new empty progress record for one exercise.
  function emptyRecord() {
    return { attempts: 0, passes: 0, hints: 0, last: { passed: false, at: '' } };
  }

  // Change the record of one exercise. changeFn gets the old record and returns the new one.
  function updateExercise(id, exerciseId, changeFn) {
    var data = getProfile(id);
    var old = data.progress[exerciseId] || emptyRecord();
    data.progress[exerciseId] = changeFn(old);
    return saveProfile(id, data);
  }

  // ---------- Backup ----------

  // Build the backup object. It never holds the key or the region.
  function makeBackup(id) {
    var data = getProfile(id);
    return {
      app: 'spanish-practice',
      type: 'progress-backup',
      version: SP.config.backupVersion,
      profile: id,
      savedAt: new Date().toISOString(),
      explanationLang: data.explanationLang,
      progress: data.progress
    };
  }

  // Return the local date of today as YYYY-MM-DD.
  function today() {
    var d = new Date();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + month + '-' + day;
  }

  // Give the backup file to the user.
  // On iPhone and iPad, the share sheet opens. The user taps "Save to Files".
  // Other browsers download the file.
  // Return a promise: 'shared', 'downloaded', or 'cancelled'.
  function downloadBackup(id) {
    var text = JSON.stringify(makeBackup(id), null, 2);
    var fileName = 'spanish-progress-' + id + '-' + today() + '.json';
    var file = null;
    try { file = new File([text], fileName, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file] }).then(
        function () { return 'shared'; },
        function (err) {
          if (err && err.name === 'AbortError') { return 'cancelled'; }
          return downloadFile(text, fileName);
        }
      );
    }
    return Promise.resolve(downloadFile(text, fileName));
  }

  // Download a text as a file with a temporary link. Return 'downloaded'.
  function downloadFile(text, fileName) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return 'downloaded';
  }

  // Check the text of a backup file for one profile.
  // Return {ok:true, data} or {ok:false, error}. A wrongProfile error also has the file profile.
  function readBackup(text, id) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'badFile' }; }
    if (!isPlainObject(data) || data.app !== 'spanish-practice' || data.type !== 'progress-backup') {
      return { ok: false, error: 'badFile' };
    }
    if (data.version !== SP.config.backupVersion) { return { ok: false, error: 'wrongVersion' }; }
    if (!isProfile(data.profile)) { return { ok: false, error: 'badFile' }; }
    if (data.profile !== id) { return { ok: false, error: 'wrongProfile', profile: data.profile }; }
    if (!isPlainObject(data.progress)) { return { ok: false, error: 'badFile' }; }
    var allObjects = Object.keys(data.progress).every(function (key) {
      return isPlainObject(data.progress[key]);
    });
    if (!allObjects) { return { ok: false, error: 'badFile' }; }
    return { ok: true, data: data };
  }

  // Replace the progress and the explanation language of a profile.
  function applyBackup(id, data) {
    return saveProfile(id, { explanationLang: data.explanationLang, progress: data.progress });
  }

  SP.storage = {
    isAvailable: isAvailable,
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    getRegion: getRegion,
    setRegion: setRegion,
    hasCredentials: hasCredentials,
    getCurrentProfile: getCurrentProfile,
    setCurrentProfile: setCurrentProfile,
    getProfile: getProfile,
    saveProfile: saveProfile,
    setExplanationLang: setExplanationLang,
    getProgress: getProgress,
    updateExercise: updateExercise,
    makeBackup: makeBackup,
    downloadBackup: downloadBackup,
    readBackup: readBackup,
    applyBackup: applyBackup
  };
}());
