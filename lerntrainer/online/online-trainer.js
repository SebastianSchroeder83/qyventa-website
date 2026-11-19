(() => {
  'use strict';

  const endpoint = 'https://sales-pruefungstrainer-download.bashcore.chatgpt.site/api/online-trainer';
  const entryPath = '/lerntrainer/online/';
  const storageKey = 'sales-pruefungstrainer-online-v2';
  const legacyStorageKey = 'sales-pruefungstrainer-online-v1';
  const themeKey = 'sales-pruefungstrainer-theme-v2';
  const themes = ['qyventa', 'light', 'dark'];
  const learnerKeys = ['sales-pruefungstrainer-learning-v1', 'sales-pruefungstrainer-pitch-v1'];
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const pages = {
    'index.html': { styles: ['style.css'], scripts: ['content.js', 'glossary.js'] },
    'training.html': { styles: ['style.css'], scripts: ['content.js', 'questions.js', 'engine.js', 'trainer.js'] },
    'pitch.html': { styles: ['style.css', 'pitch.css'], scripts: ['pitch-data.js', 'pitch.js'] },
  };
  const resources = {
    'index.html': 'text/html',
    'training.html': 'text/html',
    'pitch.html': 'text/html',
    'style.css': 'text/css',
    'pitch.css': 'text/css',
    'content.js': 'text/javascript',
    'glossary.js': 'text/javascript',
    'questions.js': 'text/javascript',
    'engine.js': 'text/javascript',
    'trainer.js': 'text/javascript',
    'pitch-data.js': 'text/javascript',
    'pitch.js': 'text/javascript',
    'icon.png': 'image/png',
  };
  const gate = document.querySelector('#online-gate');
  const form = document.querySelector('#trainer-access-form');
  const password = document.querySelector('#trainer-password');
  const privacyAcknowledged = document.querySelector('#trainer-privacy-acknowledged');
  const message = document.querySelector('#trainer-access-message');
  const submit = form.querySelector('button');
  const gateStyles = document.querySelector('#trainer-gate-styles');
  const themeSelect = document.querySelector('#trainer-theme');
  const themeControl = themeSelect.closest('.trainer-theme-control');
  let activeUntil = 0;
  let expiryTimer = 0;

  function showError(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  function validSession(value) {
    return value?.privacyVersion === 2
      && Number.isFinite(value.expiresAt)
      && value.expiresAt > Date.now()
      && Object.entries(resources).every(([name, mime]) => {
        const asset = value.assets?.[name];
        const contentType = asset?.contentType?.split(';')[0];
        return (contentType === mime || (mime === 'text/javascript' && contentType === 'application/javascript'))
          && typeof asset.body === 'string';
      })
      && /^iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(value.assets['icon.png'].body);
  }

  function runScript(code) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const src = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      function finish(callback) {
        URL.revokeObjectURL(src);
        script.remove();
        callback();
      }
      script.addEventListener('load', () => finish(resolve), { once: true });
      script.addEventListener('error', () => finish(reject), { once: true });
      script.src = src;
      document.body.append(script);
    });
  }

  function clearStoredSession() {
    try {
      for (const key of [storageKey, legacyStorageKey, themeKey, ...learnerKeys]) sessionStorage.removeItem(key);
    } catch {
      // The trainer cannot write a session when the browser blocks this storage.
    }
  }

  function setTheme(value) {
    const theme = themes.includes(value) ? value : 'qyventa';
    themeSelect.value = theme;
    document.body.dataset.trainerTheme = theme;
  }

  function storedTheme() {
    try {
      return sessionStorage.getItem(themeKey);
    } catch {
      return null;
    }
  }

  function saveTheme() {
    if (!activeUntil) return;
    try {
      sessionStorage.setItem(themeKey, themeSelect.value);
    } catch {
      // The selection still applies to the current document.
    }
  }

  function endSession() {
    window.clearTimeout(expiryTimer);
    activeUntil = 0;
    clearStoredSession();
    document.body.replaceChildren();
    window.history.replaceState(null, '', entryPath);
    window.location.reload();
  }

  function checkExpiry() {
    window.clearTimeout(expiryTimer);
    if (!activeUntil) return;
    const remaining = activeUntil - Date.now();
    if (remaining <= 0) endSession();
    else expiryTimer = window.setTimeout(checkExpiry, remaining);
  }

  async function mount(session) {
    const { assets } = session;
    const manifest = pages[page];
    if (!manifest) throw new Error('Unbekannte Trainerseite.');
    const content = new DOMParser().parseFromString(assets[page].body, 'text/html');
    if (!content.title || !content.body.querySelector('main')) throw new Error('Trainerseite unvollständig.');
    for (const script of content.body.querySelectorAll('script')) script.remove();

    const styles = document.createElement('style');
    styles.textContent = manifest.styles.map(name => assets[name].body).join('\n');
    document.head.append(styles);
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = 'data:image/png;base64,' + assets['icon.png'].body;
    document.head.append(icon);
    document.title = content.title;
    document.body.classList.replace('trainer-access', 'qyventa-trainer');
    document.body.replaceChildren(...content.body.childNodes);

    try {
      for (const name of manifest.scripts) await runScript(assets[name].body);
    } catch (error) {
      styles.remove();
      icon.remove();
      document.body.classList.replace('qyventa-trainer', 'trainer-access');
      document.body.replaceChildren(gate);
      form.hidden = true;
      showError('Der Trainer konnte nicht gestartet werden. Lade die Seite neu, um es erneut zu versuchen.');
      throw error;
    }
    gateStyles.remove();
    const footer = document.querySelector('footer') ?? document.body.appendChild(document.createElement('footer'));
    footer.classList.add('footer');
    const privacyLink = document.createElement('a');
    privacyLink.href = '/#datenschutz-trainer';
    privacyLink.textContent = 'Datenschutz zum Lerntrainer';
    const privacyRow = document.createElement('p');
    privacyRow.append(privacyLink);
    footer.append(privacyRow);

    const endButton = document.createElement('button');
    endButton.type = 'button';
    endButton.className = 'btn small danger trainer-end-session';
    endButton.textContent = 'Sitzung beenden und Eingaben löschen';
    endButton.addEventListener('click', endSession);
    (document.querySelector('header nav') ?? footer).append(themeControl, endButton);

    activeUntil = session.expiresAt;
    saveTheme();
    checkExpiry();
  }

  function readSession() {
    try {
      sessionStorage.removeItem(legacyStorageKey);
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const session = JSON.parse(stored);
        if (validSession(session)) return session;
      }
    } catch {
      showError('Falls der Trainer nicht lädt, erlaube Website-Daten für qyventa.com und lade die Seite neu.');
    }
    clearStoredSession();
    return null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!privacyAcknowledged.checked) {
      privacyAcknowledged.reportValidity();
      return;
    }
    showError('');
    submit.disabled = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const body = new URLSearchParams({ password: password.value, privacyAcknowledged: 'yes' });
      password.value = '';
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
        body,
      });
      if (response.status === 401) {
        showError('Das Passwort stimmt nicht. Bitte versuche es erneut.');
        password.focus();
        return;
      }
      if (response.status === 422) {
        showError('Bestätige bitte, dass du den Datenschutzhinweis zur Trainersitzung zur Kenntnis genommen hast.');
        privacyAcknowledged.focus();
        return;
      }
      if (response.status === 429) {
        showError('Zu viele Versuche. Bitte warte einige Minuten und versuche es dann erneut.');
        return;
      }
      if (!response.ok) throw new Error('Freigabe vorübergehend nicht erreichbar.');
      const session = await response.json();
      if (!validSession(session)) throw new Error('Trainerdateien sind unvollständig.');
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        showError('Der Browser konnte die Freigabe nicht speichern. Erlaube Website-Daten für qyventa.com und versuche es erneut.');
        return;
      }
      await mount(session);
    } catch {
      if (!form.hidden) showError('Der Trainer ist gerade nicht erreichbar. Bitte versuche es erneut.');
    } finally {
      window.clearTimeout(timeout);
      submit.disabled = false;
    }
  });

  const session = readSession();
  setTheme(session ? storedTheme() : 'qyventa');
  themeSelect.addEventListener('change', () => {
    setTheme(themeSelect.value);
    saveTheme();
  });
  if (session) {
    submit.disabled = true;
    mount(session).catch(() => {
      if (!form.hidden) showError('Der Trainer konnte nicht geladen werden. Bitte lade die Seite neu.');
    }).finally(() => { submit.disabled = false; });
  }

  window.addEventListener('pagehide', (event) => {
    if (event.persisted && activeUntil) document.body.replaceChildren();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    // Restore from the current session rather than revealing a frozen earlier form.
    const stored = readSession();
    if (activeUntil && !stored) endSession();
    else if (activeUntil || stored) window.location.reload();
    else {
      password.value = '';
      privacyAcknowledged.checked = false;
      setTheme('qyventa');
    }
  });

  window.addEventListener('focus', checkExpiry);
  document.addEventListener('visibilitychange', checkExpiry);
})();
