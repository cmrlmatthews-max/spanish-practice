/* app.js - screens and navigation.
 * The page address (hash) selects the screen:
 *   #profile, #lessons, #lesson/<lessonId>, #settings
 * The code never logs the Azure key. The key is never put back in the page.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  var SCREENS = ['profile', 'lessons', 'lesson', 'settings'];

  var loadState = 'loading';       // 'loading', 'ok', or 'error'
  var lessonData = { lessons: [], errors: [] };
  var currentScreen = '';
  var pendingBackup = null;        // backup data that waits for the user to confirm

  // ---------- Small helpers ----------

  // Return the element with this id.
  function $(id) { return document.getElementById(id); }

  // Return the current profile id, or null.
  function profileId() { return SP.storage.getCurrentProfile(); }

  // Return the interface language: English until a profile exists.
  function lang() {
    var id = profileId();
    return id ? SP.storage.getProfile(id).explanationLang : 'en';
  }

  // Return the interface text for a key in the current language.
  function t(key, vars) { return SP.t(key, lang(), vars); }

  // Show a message in a status element. Mark it as an error if needed.
  function setStatus(el, text, isError) {
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }

  // Remove all child nodes of an element.
  function clear(el) { el.innerHTML = ''; }

  // Make an element with a class name and text.
  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined) { el.textContent = text; }
    return el;
  }

  // ---------- Navigation ----------

  // Read the page address. Return {name, id}.
  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('lesson/') === 0) {
      var id = h.slice(7);
      try { id = decodeURIComponent(id); } catch (e) { /* keep the raw text */ }
      return { name: 'lesson', id: id };
    }
    if (h === 'profile' || h === 'lessons' || h === 'settings') { return { name: h, id: '' }; }
    return { name: '', id: '' };
  }

  // Go to a screen. Draw it again if the address does not change.
  function navigate(hash) {
    if (location.hash === '#' + hash) { render(false); } else { location.hash = hash; }
  }

  // Change the address without a hashchange event.
  function fixHash(hash) {
    try { history.replaceState(null, '', '#' + hash); } catch (e) { /* ignore */ }
  }

  // Show one screen and hide the others.
  function showScreen(name) {
    currentScreen = name;
    if (name !== 'lesson') { SP.runner.close(); }
    SCREENS.forEach(function (s) { $('screen-' + s).hidden = (s !== name); });
  }

  // Fill all texts with a data-t attribute in the current language.
  function applyStaticText() {
    var current = lang();
    document.documentElement.lang = (current === 'es') ? 'es-MX' : 'en';
    document.querySelectorAll('[data-t]').forEach(function (el) {
      el.textContent = SP.t(el.getAttribute('data-t'), current);
    });
    document.querySelectorAll('[data-profile]').forEach(function (el) {
      el.textContent = SP.config.profileNames[el.getAttribute('data-profile')];
    });
  }

  // Choose the screen to draw. The first call (startup) can redirect to Settings.
  function render(startup) {
    applyStaticText();
    var route = parseHash();
    var id = profileId();
    if (!id) {
      if (route.name !== 'profile') { fixHash('profile'); }
      renderProfile();
    } else if (startup && !SP.storage.hasCredentials()) {
      fixHash('settings');
      renderSettings();
    } else if (route.name === 'settings') {
      renderSettings();
    } else if (route.name === 'lesson') {
      renderLessonRoute(route.id, id);
    } else if (route.name === 'profile') {
      renderProfile();
    } else {
      if (route.name !== 'lessons') { fixHash('lessons'); }
      renderLessons();
    }
  }

  // Draw the lesson screen, or go back to the list if the lesson does not exist.
  function renderLessonRoute(lessonId, id) {
    if (loadState !== 'ok') { renderLessons(); return; }
    var mine = SP.lessons.forProfile(lessonData.lessons, id);
    var lesson = mine.filter(function (l) { return l.lessonId === lessonId; })[0];
    if (!lesson) { fixHash('lessons'); renderLessons(); return; }
    renderLesson(lesson, id);
  }

  // ---------- Profile screen ----------

  // Show the profile screen.
  function renderProfile() {
    showScreen('profile');
  }

  // Save the chosen profile. Then go to Settings or to the lessons.
  function chooseProfile(id) {
    SP.storage.setCurrentProfile(id);
    navigate(SP.storage.hasCredentials() ? 'lessons' : 'settings');
  }

  // ---------- Lessons screen ----------

  // Make one button for a lesson in the list.
  function makeLessonButton(lesson, progress) {
    var button = make('button', 'lesson-item');
    button.type = 'button';
    button.appendChild(make('span', 'lesson-title', lesson.title));
    if (lang() === 'en') { button.appendChild(make('span', 'lesson-title-en', lesson.titleEn)); }
    var count = SP.lessons.countPassed(lesson, progress);
    var meta = t('stage', { n: lesson.stage }) + ' · ' + t('passedCount', count);
    button.appendChild(make('span', 'lesson-meta', meta));
    button.addEventListener('click', function () { navigate('lesson/' + lesson.lessonId); });
    return button;
  }

  // Draw the list of lesson file problems (for the maintainer).
  function renderProblems() {
    var box = $('lessons-problems');
    var body = $('lessons-problems-body');
    clear(body);
    var errors = lessonData.errors;
    box.hidden = (loadState !== 'ok' || errors.length === 0);
    if (box.hidden) { return; }
    $('lessons-problems-title').textContent = t('lessonFileProblems', { count: errors.length });
    errors.forEach(function (entry) {
      body.appendChild(make('p', 'problem-file', entry.file));
      var list = make('ul', 'problem-list');
      entry.messages.forEach(function (m) { list.appendChild(make('li', '', m)); });
      body.appendChild(list);
    });
  }

  // Show the lessons screen.
  function renderLessons() {
    showScreen('lessons');
    var id = profileId();
    var list = $('lessons-list');
    clear(list);
    $('lessons-profile').textContent = SP.config.profileNames[id];
    $('btn-retry').hidden = (loadState !== 'error');
    setStatus($('lessons-status'), '');
    if (loadState === 'loading') { setStatus($('lessons-status'), t('lessonsLoading')); }
    if (loadState === 'error') { setStatus($('lessons-status'), t('lessonsLoadError'), true); }
    if (loadState === 'ok') {
      var mine = SP.lessons.forProfile(lessonData.lessons, id);
      var progress = SP.storage.getProgress(id);
      if (mine.length === 0) { setStatus($('lessons-status'), t('lessonsNone')); }
      mine.forEach(function (lesson) { list.appendChild(makeLessonButton(lesson, progress)); });
    }
    renderProblems();
  }

  // Load the lessons. Draw the screen again when the load ends.
  async function loadLessons() {
    loadState = 'loading';
    if (currentScreen === 'lessons') { renderLessons(); }
    try {
      lessonData = await SP.lessons.loadAll();
      loadState = 'ok';
    } catch (e) {
      loadState = 'error';
    }
    // Do not draw Settings again. It would erase what the user types.
    if (currentScreen !== 'settings' && currentScreen !== 'profile') { render(false); }
  }

  // ---------- Lesson screen ----------

  // Show one lesson. The runner draws the start view, the exercises, and the end.
  function renderLesson(lesson) {
    showScreen('lesson');
    $('lesson-title').textContent = lesson.title;
    var en = $('lesson-title-en');
    en.hidden = (lang() !== 'en');
    en.textContent = lesson.titleEn;
    SP.runner.open(lesson, profileId());
  }

  // ---------- Settings screen ----------

  // Update the key placeholder and the "key missing" notice.
  function refreshKeyState() {
    var key = $('inp-key');
    key.value = '';
    key.placeholder = t(SP.storage.getKey() ? 'keySavedPlaceholder' : 'keyEmptyPlaceholder');
    var notice = $('settings-notice');
    notice.hidden = SP.storage.hasCredentials();
    notice.textContent = t('keyMissing');
  }

  // Fill the profile list with the names of the profiles.
  function fillProfileSelect(current) {
    var select = $('sel-profile');
    clear(select);
    SP.config.profiles.forEach(function (id) {
      var option = make('option', '', SP.config.profileNames[id]);
      option.value = id;
      select.appendChild(option);
    });
    select.value = current;
  }

  // Show the Settings screen.
  function renderSettings() {
    showScreen('settings');
    var id = profileId();
    pendingBackup = null;
    $('backup-confirm').hidden = true;
    setStatus($('settings-status'), '');
    setStatus($('backup-status'), '');
    $('btn-settings-back').hidden = !id;
    if (id) {
      fillProfileSelect(id);
      $('sel-lang').value = SP.storage.getProfile(id).explanationLang;
    }
    $('inp-region').value = SP.storage.getRegion();
    refreshKeyState();
  }

  // Save the key and the region.
  function saveCredentials() {
    var key = $('inp-key').value.trim() || SP.storage.getKey();
    var region = $('inp-region').value.replace(/\s+/g, '').toLowerCase();
    var status = $('settings-status');
    if (!key || !region) { setStatus(status, t('saveNeedsBoth'), true); return; }
    var okKey = SP.storage.setKey(key);
    var okRegion = SP.storage.setRegion(region);
    $('inp-region').value = region;
    refreshKeyState();
    if (okKey && okRegion) { setStatus(status, t('saved')); } else { setStatus(status, t('saveFailed'), true); }
  }

  // Remove the key from this device.
  function deleteKey() {
    SP.storage.clearKey();
    refreshKeyState();
    setStatus($('settings-status'), t('keyDeleted'));
  }

  // Switch to another profile. Draw Settings again in the language of that profile.
  function changeProfile() {
    SP.storage.setCurrentProfile($('sel-profile').value);
    render(false);
  }

  // Save the explanation language of the current profile. Then draw again.
  function changeLang() {
    SP.storage.setExplanationLang(profileId(), $('sel-lang').value);
    render(false);
  }

  // ---------- Backup ----------

  // Give the progress file of the current profile to the user.
  function saveBackup() {
    SP.storage.downloadBackup(profileId()).then(function (result) {
      setStatus($('backup-status'), result === 'cancelled' ? '' : t('backupSaved'));
    });
  }

  // Read the chosen file. Show an error, or ask the user to confirm.
  async function onBackupFile() {
    var file = $('inp-backup-file').files[0];
    var status = $('backup-status');
    $('backup-confirm').hidden = true;
    pendingBackup = null;
    if (!file) { return; }
    var text = '';
    try { text = await file.text(); } catch (e) { setStatus(status, t('backupBadFile'), true); return; }
    var result = SP.storage.readBackup(text, profileId());
    if (!result.ok) {
      var vars = { profile: SP.config.profileNames[result.profile] || '' };
      var key = { badFile: 'backupBadFile', wrongProfile: 'backupWrongProfile', wrongVersion: 'backupWrongVersion' }[result.error];
      setStatus(status, t(key || 'backupBadFile', vars), true);
      return;
    }
    pendingBackup = result.data;
    setStatus(status, '');
    $('backup-confirm').hidden = false;
  }

  // Replace the progress with the data of the chosen file.
  function confirmBackup() {
    if (!pendingBackup) { return; }
    var saved = SP.storage.applyBackup(profileId(), pendingBackup);
    renderSettings();
    applyStaticText();
    setStatus($('backup-status'), saved ? t('backupLoaded') : t('saveFailed'), !saved);
  }

  // Cancel the load of the backup file.
  function cancelBackup() {
    pendingBackup = null;
    $('backup-confirm').hidden = true;
  }

  // ---------- Start ----------

  // Connect all buttons to their functions.
  function wireEvents() {
    document.querySelectorAll('[data-profile]').forEach(function (button) {
      button.addEventListener('click', function () { chooseProfile(button.getAttribute('data-profile')); });
    });
    $('btn-settings').addEventListener('click', function () { navigate('settings'); });
    $('btn-retry').addEventListener('click', loadLessons);
    $('btn-lesson-back').addEventListener('click', function () { navigate('lessons'); });
    $('btn-settings-back').addEventListener('click', function () { navigate('lessons'); });
    $('sel-profile').addEventListener('change', changeProfile);
    $('sel-lang').addEventListener('change', changeLang);
    $('btn-save').addEventListener('click', saveCredentials);
    $('btn-delete-key').addEventListener('click', deleteKey);
    $('btn-backup-save').addEventListener('click', saveBackup);
    // The Load button is a label for the file input. Clear the old choice so the same file works again.
    $('inp-backup-file').addEventListener('click', function () { this.value = ''; });
    $('inp-backup-file').addEventListener('change', onBackupFile);
    $('btn-backup-yes').addEventListener('click', confirmBackup);
    $('btn-backup-no').addEventListener('click', cancelBackup);
    window.addEventListener('hashchange', function () { render(false); });
  }

  // Start the tool.
  function init() {
    $('banner-storage').hidden = SP.storage.isAvailable();
    wireEvents();
    render(true);
    loadLessons();
  }

  SP.app = { init: init, navigate: navigate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
