import './style.css';
import { translations } from './i18n.js';

// --- State ---
let notes = [];
let reminders = [];
let settings = { snoozeDuration: 5 };
let currentEditingNoteId = null;
let currentEditingReminderId = null;
let currentTaskFilter = 'all';
let currentLang = 'tr';

// --- Elements ---
const notesView = document.getElementById('notes-view');
const remindersView = document.getElementById('reminders-view');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.querySelector('.sidebar');

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

const navItems = document.querySelectorAll('.nav-item[data-target]');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

const modalOverlay = document.getElementById('modal-overlay');
const noteModal = document.getElementById('note-modal');
const reminderModal = document.getElementById('reminder-modal');
const closeBtns = document.querySelectorAll('.close-modal');

// Note Form Elements
const noteTitle = document.getElementById('note-title');
const noteContent = document.getElementById('note-content');
const saveNoteBtn = document.getElementById('save-note-btn');
const editNoteBtn = document.getElementById('edit-note-btn');
const notesContainer = document.getElementById('notes-container');

// Reminder Form Elements
const reminderTitle = document.getElementById('reminder-title');
const reminderNote = document.getElementById('reminder-note');
const reminderFreqNum = document.getElementById('reminder-freq-num');
const reminderFreqType = document.getElementById('reminder-freq-type');
const weekDaysSelector = document.getElementById('week-days-selector');
const dayBtns = document.querySelectorAll('.day-btn');
const reminderTime = document.getElementById('reminder-time');
const reminderStartDate = document.getElementById('reminder-start-date');
const taskDueDate = document.getElementById('task-due-date');
const taskHasAlarm = document.getElementById('task-has-alarm');
const alarmSettingsContainer = document.getElementById('alarm-settings-container');
const endTypeRadios = document.querySelectorAll('input[name="end-type"]');
const reminderEndDate = document.getElementById('reminder-end-date');
const saveReminderBtn = document.getElementById('save-reminder-btn');
const editReminderBtn = document.getElementById('edit-reminder-btn');
const remindersContainer = document.getElementById('reminders-container');

// --- Helper Functions ---

function applyTranslations() {
  const t = translations[currentLang];
  if (!t) return;
  document.title = t.appTitle || "Hatırlat Bana";
  if (window.api && window.api.updateTrayLang) {
    window.api.updateTrayLang({
      appTitle: t.appTitle || "Hatırlat Bana",
      openApp: t.trayOpenApp || "Uygulamayı Aç",
      quitApp: t.trayQuitApp || "Çıkış Yap"
    });
  }
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.innerHTML = t[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key]) el.setAttribute('placeholder', t[key]);
  });
  const dayBtns = document.querySelectorAll('.day-btn');
  dayBtns.forEach(btn => {
    const dayVal = btn.dataset.day;
    if(t.daysShort[dayVal]) btn.textContent = t.daysShort[dayVal];
  });
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString(currentLang === 'tr' ? 'tr-TR' : 'en-US', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setNoteModalMode(isReadOnly) {
  noteTitle.disabled = isReadOnly;
  noteContent.disabled = isReadOnly;
  if (isReadOnly) {
    saveNoteBtn.style.display = 'none';
    editNoteBtn.style.display = 'block';
  } else {
    saveNoteBtn.style.display = 'block';
    editNoteBtn.style.display = 'none';
  }
}

let confirmResolve = null;
const confirmModal = document.getElementById('confirm-modal');
const confirmMessageEl = document.getElementById('confirm-message');

function showCustomConfirm(message, confirmText = 'Sil') {
  return new Promise((resolve) => {
    confirmMessageEl.textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent = confirmText;
    confirmResolve = resolve;
    openModal(confirmModal);
  });
}

document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
  closeModal();
  if (confirmResolve) confirmResolve(false);
});

document.getElementById('confirm-ok-btn').addEventListener('click', () => {
  closeModal();
  if (confirmResolve) confirmResolve(true);
});

function setReminderModalMode(isReadOnly) {
  const inputs = reminderModal.querySelectorAll('input, textarea, select');
  inputs.forEach(el => el.disabled = isReadOnly);
  
  if (!isReadOnly) {
    const endType = document.querySelector('input[name="end-type"]:checked').value;
    reminderEndDate.disabled = endType === 'never';
  }
  
  dayBtns.forEach(btn => {
    btn.style.pointerEvents = isReadOnly ? 'none' : 'auto';
    btn.style.opacity = isReadOnly ? '0.7' : '1';
  });
  
  if (isReadOnly) {
    saveReminderBtn.style.display = 'none';
    editReminderBtn.style.display = 'block';
  } else {
    saveReminderBtn.style.display = 'block';
    editReminderBtn.style.display = 'none';
  }
}

// --- Initialization ---
async function init() {
  // Try to load data from Electron API
  if (window.api) {
    const data = await window.api.readData();

    if (data) {
      notes = data.notes || [];
      reminders = data.reminders || [];
      settings = data.settings || { snoozeDuration: 5 };
      if (!settings.language) {
        settings.language = navigator.language.startsWith('tr') ? 'tr' : 'en';
      }
      currentLang = settings.language;

      if (!settings.theme) {
        settings.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', settings.theme);
    }

    
    // Init autostart feature (default to true on first launch)
    const autostartToggle = document.getElementById('autostart-toggle');
    if (autostartToggle && window.api.getAutostart) {
      if (settings.autostart === undefined) {
        // Migration from old version if hasInitializedAutostart exists
        if (settings.hasInitializedAutostart) {
          settings.autostart = await window.api.getAutostart();
        } else {
          settings.autostart = true;
        }
        await window.api.setAutostart(settings.autostart);
        await saveData();
      } else {
        // Enforce the saved setting on launch
        await window.api.setAutostart(settings.autostart);
      }
      
      autostartToggle.checked = settings.autostart;
      
      autostartToggle.addEventListener('change', async (e) => {
        settings.autostart = e.target.checked;
        await window.api.setAutostart(e.target.checked);
        await saveData();
      });
    }

    if (document.getElementById('snooze-duration')) {
        document.getElementById('snooze-duration').value = settings.snoozeDuration;
      }
      reminders.forEach(r => {
        if (r.hasAlarm && !r.startDate) {
          r.startDate = new Date().toLocaleDateString('en-CA');
        }
      });
  }
  
  // Bind Search and Sort Listeners
  document.getElementById('notes-search').addEventListener('input', renderNotes);
  document.getElementById('notes-sort').addEventListener('change', renderNotes);
  document.getElementById('reminders-search').addEventListener('input', renderReminders);
  document.getElementById('reminders-sort').addEventListener('change', renderReminders);
  
  
  const langSelect = document.getElementById('language-select');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', async (e) => {
      settings.language = e.target.value;
      currentLang = settings.language;
      applyTranslations();
      renderNotes();
      renderReminders();
      await saveData();
    });
  }
  applyTranslations();

  renderNotes();
  renderReminders();
  setupRemindersCheck();
  
  // Setup Date/Time Defaults
  const now = new Date();
  reminderStartDate.valueAsDate = now;
  reminderTime.value = now.toTimeString().slice(0, 5);

  if (window.api && window.api.onNotificationClicked) {
    window.api.onNotificationClicked((id) => {
      // Switch to reminders tab
      navItems.forEach(n => n.classList.remove('active'));
      document.querySelector('[data-target="reminders-view"]').classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('reminders-view').classList.add('active');
      
      openSimpleAlert(id);
    });
  }

  if (window.api && window.api.onOpenNewReminder) {
    window.api.onOpenNewReminder(() => {
      document.getElementById('add-reminder-btn').click();
    });
  }

  if (window.api && window.api.onNotificationAction) {
    window.api.onNotificationAction(async ({ id, action }) => {
      const rem = reminders.find(r => r.id === id);
      if (!rem) return;

      if (action === 'snooze') {
        const duration = parseInt(settings.snoozeDuration) || 5;
        rem.snoozedUntil = Date.now() + duration * 60000;
        await saveData();
        if (window.api && window.api.showAlert) {
          window.api.showAlert(translations[currentLang].dynamicAlertSnoozed.replace('{x}', duration));
        }
      } else if (action === 'complete') {
        markTaskCompleted(rem);
        await saveData();
        renderReminders();
        if (window.api && window.api.showAlert) {
          window.api.showAlert(translations[currentLang].dynamicAlertCompleted);
        }
      }
    });
  }

  // Auto-update status listener
  if (window.api && window.api.onUpdateStatus) {
    window.api.onUpdateStatus((status) => {
      const banner = document.getElementById('update-banner');
      if (!banner) return;
      if (status === 'downloading') {
        banner.style.display = 'flex';
        banner.querySelector('#update-banner-text').textContent =
          translations[currentLang].updateDownloading || 'Güncelleme indiriliyor...';
        banner.querySelector('#update-install-btn').style.display = 'none';
      } else if (status === 'ready') {
        banner.style.display = 'flex';
        banner.querySelector('#update-banner-text').textContent =
          translations[currentLang].updateReady || 'Güncelleme hazır!';
        banner.querySelector('#update-install-btn').style.display = 'inline-block';
      }
    });
    document.getElementById('update-install-btn')?.addEventListener('click', () => {
      if (window.api.installUpdate) window.api.installUpdate();
    });
    document.getElementById('update-dismiss-btn')?.addEventListener('click', () => {
      const banner = document.getElementById('update-banner');
      if (banner) banner.style.display = 'none';
    });
  }

  // Show app version in settings and sidebar
  if (window.api && window.api.getAppVersion) {
    window.api.getAppVersion().then(version => {
      const el = document.getElementById('app-version-display');
      if (el) el.textContent = `v${version}`;
      
      const sidebarEl = document.getElementById('sidebar-version-display');
      if (sidebarEl) sidebarEl.textContent = `v${version}`;
    });
  }

  // Google Sync UI Setup
  if (window.api && window.api.googleStatus) {
    const updateSyncUI = async () => {
      const isLoggedIn = await window.api.googleStatus();
      const outDiv = document.getElementById('sync-logged-out');
      const inDiv = document.getElementById('sync-logged-in');
      if (outDiv && inDiv) {
        if (isLoggedIn) {
          outDiv.style.display = 'none';
          inDiv.style.display = 'block';
        } else {
          outDiv.style.display = 'block';
          inDiv.style.display = 'none';
        }
      }
    };
    
    await updateSyncUI();

    document.getElementById('google-login-btn')?.addEventListener('click', async () => {

      
      const success = await window.api.googleLogin();
      if (success) {
        await updateSyncUI();
      } else {
        if (window.api.showAlert) window.api.showAlert('Giriş başarısız oldu veya iptal edildi.');
        else alert('Giriş başarısız oldu veya iptal edildi.');
      }
    });

    document.getElementById('google-logout-btn')?.addEventListener('click', async () => {
      const isConfirmed = await showCustomConfirm('Google Drive bağlantısını kesmek istediğinize emin misiniz?', 'Evet, Kes');
      if (!isConfirmed) return;
      await window.api.googleLogout();
      await updateSyncUI();
    });

    document.getElementById('google-sync-now-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('google-sync-now-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="ms-Icon ms-Icon--Sync" aria-hidden="true" style="animation: spin 1s linear infinite;"></i> Eşitleniyor...';
      btn.disabled = true;

      const res = await window.api.googleSyncNow();
      if (res.success) {
        if (res.action === 'downloaded') {
          // reload data
          const data = await window.api.readData();
          if (data) {
            notes = data.notes || [];
            reminders = data.reminders || [];
            renderNotes();
            renderReminders();
          }
          if (window.api.showAlert) window.api.showAlert('Verileriniz Google Drive üzerinden başarıyla güncellendi.');
        } else {
          if (window.api.showAlert) window.api.showAlert('Verileriniz Google Drive\'a başarıyla yüklendi.');
        }
      } else {
        if (window.api.showAlert) window.api.showAlert('Senkronizasyon hatası: ' + res.error);
      }
      
      btn.innerHTML = originalText;
      btn.disabled = false;
    });

    if (window.api.onSyncCompleted) {
      window.api.onSyncCompleted(async (action) => {
        if (action === 'downloaded') {
          const data = await window.api.readData();
          if (data) {
            notes = data.notes || [];
            reminders = data.reminders || [];
            renderNotes();
            renderReminders();
          }
          if (window.api.showNotification) {
            window.api.showNotification({
              id: 'sync-done',
              title: 'Hatırlat Bana - Senkronizasyon',
              body: 'Notlarınız Google Drive üzerinden güncellendi.'
            });
          }
        }
      });
    }
  }
}

// --- Navigation ---
navItems.forEach(item => {
  item.addEventListener('click', () => {
    // Determine the view target
    const target = item.dataset.target;
    
    // Clear active class from all main nav items and sub items
    navItems.forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.sub-item').forEach(n => n.classList.remove('active'));
    
    // If it's a sub-item, we should make the parent main item active too (Görevler)
    if (item.classList.contains('sub-item')) {
      item.classList.add('active');
      document.querySelector('.nav-item[data-filter="all"]').classList.add('active');
    } else {
      item.classList.add('active');
    }
    
    // Handle filters
    if (item.hasAttribute('data-filter')) {
      currentTaskFilter = item.dataset.filter;
      renderReminders();
    }
    
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(target).classList.add('active');
  });
});

// --- Settings & Data Management ---
themeToggleBtn.addEventListener('click', async () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  settings.theme = newTheme;
  if (window.api) {
    await window.api.saveData({ notes, reminders, settings });
  }
});

const snoozeSelect = document.getElementById('snooze-duration');
if (snoozeSelect) {
  snoozeSelect.addEventListener('change', async (e) => {
    settings.snoozeDuration = e.target.value;
    await saveData();
  });
}

document.getElementById('export-data-btn').addEventListener('click', async () => {
  if (!window.api || !window.api.exportData) return;
  const dataToExport = { notes, reminders };
  const success = await window.api.exportData(dataToExport);
  if (success) {
    if (window.api.showAlert) await window.api.showAlert(translations[currentLang].dynamicAlertExportSuccess);
    else alert(translations[currentLang].dynamicAlertExportSuccess);
  }
});

document.getElementById('import-data-btn').addEventListener('click', async () => {
  if (!window.api || !window.api.importData) return;
  const isConfirmed = await showCustomConfirm(translations[currentLang].dynamicAlertImportConfirm);
  if (!isConfirmed) return;
  
  const importedData = await window.api.importData();
  if (importedData) {
    notes = importedData.notes || [];
    reminders = importedData.reminders || [];
    await saveData();
    renderNotes();
    renderReminders();
    if (window.api.showAlert) await window.api.showAlert(translations[currentLang].dynamicAlertImportSuccess);
    else alert(translations[currentLang].dynamicAlertImportSuccess);
  }
});

// --- Modals ---
function openModal(modal) {
  modalOverlay.style.display = 'block';
  modal.classList.add('show');
}

function closeModal() {
  modalOverlay.style.display = 'none';
  document.querySelectorAll('.fluent-modal').forEach(m => m.classList.remove('show'));
}

closeBtns.forEach(btn => btn.addEventListener('click', closeModal));
document.getElementById('add-note-btn').addEventListener('click', () => {
  currentEditingNoteId = null;
  document.getElementById('note-modal-title').textContent = translations[currentLang].modalNewNote;
  noteTitle.value = '';
  noteContent.value = '';
  setNoteModalMode(false);
  openModal(noteModal);
});
document.getElementById('add-reminder-btn').addEventListener('click', () => {
  currentEditingReminderId = null;
  document.getElementById('reminder-modal-title').textContent = translations[currentLang].modalNewTask;
  reminderTitle.value = '';
  reminderNote.value = '';
  taskDueDate.value = '';
  taskHasAlarm.checked = false;
  alarmSettingsContainer.style.display = 'none';
  const now = new Date();
  reminderStartDate.value = now.toLocaleDateString('en-CA');
  reminderTime.value = now.toTimeString().slice(0, 5);
  reminderFreqType.value = 'once';
  updateReminderTypeUI('once');
  setReminderModalMode(false);
  openModal(reminderModal);
});

editNoteBtn.addEventListener('click', () => setNoteModalMode(false));
editReminderBtn.addEventListener('click', () => setReminderModalMode(false));

// --- Note Logic ---
saveNoteBtn.addEventListener('click', async () => {
  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();
  
  if (!title && !content) return;
  
  if (currentEditingNoteId) {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.title = title;
      note.content = content;
      note.updatedAt = new Date().toISOString();
    }
  } else {
    const newNote = {
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: new Date().toISOString()
    };
    notes.push(newNote);
  }
  
  renderNotes();
  closeModal();
  await saveData();
});

function renderNotes() {
  notesContainer.innerHTML = '';
  
  const searchTerm = document.getElementById('notes-search').value.toLowerCase();
  const sortMode = document.getElementById('notes-sort').value;
  
  let filteredNotes = notes.filter(n => 
    (n.title || '').toLowerCase().includes(searchTerm) || 
    (n.content || '').toLowerCase().includes(searchTerm)
  );

  filteredNotes.sort((a, b) => {
    if (sortMode === 'newest') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    } else if (sortMode === 'oldest') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    } else if (sortMode === 'updated') {
      const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(a.createdAt);
      const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(b.createdAt);
      return dateB - dateA;
    }
    return 0;
  });

  filteredNotes.forEach(note => {
    let dateText = '';
    if (note.createdAt) {
      dateText += `<div class="card-date mt-2">${translations[currentLang].dynamicAdded}: ${formatDate(note.createdAt)}</div>`;
    }
    if (note.updatedAt) {
      dateText += `<div class="card-date mt-1">${translations[currentLang].dynamicUpdated}: ${formatDate(note.updatedAt)}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = note.id;
    card.innerHTML = `
      <div class="card-actions">
        <button class="icon-btn delete-note" data-id="${note.id}"><i class="ms-Icon ms-Icon--Delete" aria-hidden="true"></i></button>
      </div>
      <div class="card-title"><strong>${escapeHTML(note.title) || translations[currentLang].dynamicUntitledNote}</strong></div>
      <div class="card-content">${escapeHTML(note.content)}</div>
      ${dateText}
    `;
    card.addEventListener('click', () => openNoteDetails(note.id));
    notesContainer.appendChild(card);
  });
  
  document.querySelectorAll('.delete-note').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent card click
      const id = e.currentTarget.dataset.id;
      const isConfirmed = await showCustomConfirm(translations[currentLang].dynamicAlertConfirmDeleteNote);
      if (!isConfirmed) return;
      notes = notes.filter(n => n.id !== id);
      renderNotes();
      await saveData();
    });
  });
  
  const notesCountEl = document.getElementById('sidebar-notes-count');
  if (notesCountEl) {
    notesCountEl.textContent = notes.length > 0 ? `(${notes.length})` : '';
  }
}

window.openNoteDetails = function(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  
  currentEditingNoteId = id;
  document.getElementById('note-modal-title').textContent = translations[currentLang].dynamicNoteDetail;
  noteTitle.value = note.title;
  noteContent.value = note.content;
  setNoteModalMode(true);
  openModal(noteModal);
};

// --- Reminder Logic ---
function markTaskCompleted(rem) {
  if (rem.frequency.type === 'once') {
    rem.isActive = false;
    rem.isCompleted = true;
  } else {
    // Advance to next period
    if (rem.hasAlarm && rem.startDate) {
      const sObj = new Date(rem.startDate);
      if (rem.frequency.type === 'day') sObj.setDate(sObj.getDate() + rem.frequency.num);
      else if (rem.frequency.type === 'week') sObj.setDate(sObj.getDate() + (7 * rem.frequency.num));
      else if (rem.frequency.type === 'month') sObj.setMonth(sObj.getMonth() + rem.frequency.num);
      rem.startDate = sObj.toISOString().split('T')[0];
    }
    if (rem.dueDate) {
      const dObj = new Date(rem.dueDate);
      if (rem.frequency.type === 'day') dObj.setDate(dObj.getDate() + rem.frequency.num);
      else if (rem.frequency.type === 'week') dObj.setDate(dObj.getDate() + (7 * rem.frequency.num));
      else if (rem.frequency.type === 'month') dObj.setMonth(dObj.getMonth() + rem.frequency.num);
      rem.dueDate = dObj.toISOString().split('T')[0];
    }
    rem.isCompleted = false; // it's repeating, so don't mark completely done, just shifted
    rem.snoozedUntil = null; // clear any snooze
  }
}

function updateReminderTypeUI(typeVal) {
  reminderFreqNum.disabled = (typeVal === 'once');
  reminderFreqNum.style.display = (typeVal === 'once') ? 'none' : 'block';
  
  const repeatEndContainer = document.getElementById('repeat-end-container');
  if (repeatEndContainer) {
    repeatEndContainer.style.display = (typeVal === 'once') ? 'none' : 'block';
  }
  
  if (typeVal === 'once') {
    reminderFreqNum.value = '1';
  }
  
  if (typeVal === 'week') {
    weekDaysSelector.style.display = 'flex';
  } else {
    weekDaysSelector.style.display = 'none';
  }
}

reminderFreqType.addEventListener('change', (e) => {
  updateReminderTypeUI(e.target.value);
});

dayBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('selected');
    
    // Auto adjust reminder start date to the closest selected day
    if (reminderFreqType.value === 'week') {
      const selectedDays = Array.from(dayBtns)
        .filter(b => b.classList.contains('selected'))
        .map(b => parseInt(b.dataset.day));
        
      if (selectedDays.length > 0) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let minDaysToWait = 7;
        const todayDay = now.getDay();
        
        selectedDays.forEach(targetDay => {
          let diff = targetDay - todayDay;
          if (diff < 0) diff += 7;
          if (diff < minDaysToWait) {
            minDaysToWait = diff;
          }
        });
        
        const nextDate = new Date(now);
        nextDate.setDate(now.getDate() + minDaysToWait);
        reminderStartDate.value = nextDate.toLocaleDateString('en-CA');
      }
    }
  });
});

taskHasAlarm.addEventListener('change', (e) => {
  alarmSettingsContainer.style.display = e.target.checked ? 'block' : 'none';
});

endTypeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    reminderEndDate.disabled = e.target.value === 'never';
  });
});

saveReminderBtn.addEventListener('click', async () => {
  const title = reminderTitle.value.trim();
  const note = reminderNote.value.trim();
  if (!title) {
    if (window.api && window.api.showAlert) {
      await window.api.showAlert(translations[currentLang].dynamicAlertNeedTitle);
    } else {
      alert(translations[currentLang].dynamicAlertNeedTitle);
    }
    return;
  }
  
  const freqNum = parseInt(reminderFreqNum.value);
  const freqType = reminderFreqType.value;
  const time = reminderTime.value;
  const startDate = reminderStartDate.value;
  const dueDate = taskDueDate.value || null;
  const hasAlarm = taskHasAlarm.checked;
  const endType = document.querySelector('input[name="end-type"]:checked').value;
  const endDate = endType === 'date' ? reminderEndDate.value : null;
  
  if (hasAlarm && (!startDate || !time)) {
    if (window.api && window.api.showAlert) {
      window.api.showAlert(translations[currentLang].dynamicAlertNeedTime);
    } else {
      alert(translations[currentLang].dynamicAlertNeedTime);
    }
    return;
  }

  const selectedDays = [];
  if (freqType === 'week') {
    dayBtns.forEach(btn => {
      if (btn.classList.contains('selected')) {
        selectedDays.push(parseInt(btn.dataset.day));
      }
    });
    if (selectedDays.length === 0 && hasAlarm) {
      alert(translations[currentLang].dynamicAlertNeedDay);
      return;
    }
  }

  const newReminderData = {
    title,
    note,
    dueDate,
    hasAlarm,
    frequency: { num: freqNum, type: freqType },
    daysOfWeek: selectedDays,
    time: hasAlarm ? time : null,
    startDate: hasAlarm ? startDate : null,
    endDate,
    isActive: true
  };
  
  if (currentEditingReminderId) {
    const rem = reminders.find(r => r.id === currentEditingReminderId);
    if (rem) {
      Object.assign(rem, newReminderData);
      rem.updatedAt = new Date().toISOString();
      // Reset trigger to allow it to trigger again if time changed
      rem.lastTriggered = null; 
    }
  } else {
    reminders.push({
      id: crypto.randomUUID(),
      ...newReminderData,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      lastTriggered: null
    });
  }
  
  renderReminders();
  closeModal();
  await saveData();
});

function renderReminders() {
  remindersContainer.innerHTML = '';
  
  const searchTerm = document.getElementById('reminders-search').value.toLowerCase();
  const sortMode = document.getElementById('reminders-sort').value;
  
  let filteredReminders = reminders.filter(r => 
    (r.title || '').toLowerCase().includes(searchTerm) || 
    (r.note || '').toLowerCase().includes(searchTerm)
  );

  // Apply Sidebar Filter
  const filterTodayStr = new Date().toLocaleDateString('en-CA');
  const filterYesterdayObj = new Date();
  filterYesterdayObj.setDate(filterYesterdayObj.getDate() - 1);
  const filterYesterdayStr = filterYesterdayObj.toLocaleDateString('en-CA');
  const filterTomorrowObj = new Date();
  filterTomorrowObj.setDate(filterTomorrowObj.getDate() + 1);
  const filterTomorrowStr = filterTomorrowObj.toLocaleDateString('en-CA');

  if (currentTaskFilter === 'today') {
    filteredReminders = filteredReminders.filter(r => r.dueDate === filterTodayStr && !r.isCompleted);
  } else if (currentTaskFilter === 'tomorrow') {
    filteredReminders = filteredReminders.filter(r => r.dueDate === filterTomorrowStr && !r.isCompleted);
  } else if (currentTaskFilter === 'yesterday') {
    filteredReminders = filteredReminders.filter(r => r.dueDate === filterYesterdayStr && !r.isCompleted);
  } else if (currentTaskFilter === 'older') {
    filteredReminders = filteredReminders.filter(r => r.dueDate && r.dueDate < filterYesterdayStr && !r.isCompleted);
  } else if (currentTaskFilter === 'upcoming') {
    filteredReminders = filteredReminders.filter(r => r.dueDate && r.dueDate > filterTomorrowStr && !r.isCompleted);
  } else if (currentTaskFilter === 'completed') {
    filteredReminders = filteredReminders.filter(r => r.isCompleted);
  } else if (currentTaskFilter === 'nodate') {
    filteredReminders = filteredReminders.filter(r => !r.dueDate && !r.isCompleted);
  } else if (currentTaskFilter === 'all') {
    filteredReminders = filteredReminders.filter(r => !r.isCompleted);
  }

  filteredReminders.sort((a, b) => {
    if (sortMode === 'dueDate') {
      const dateA = a.dueDate ? new Date(a.dueDate) : new Date(8640000000000000);
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date(8640000000000000);
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    } else if (sortMode === 'newest') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    } else if (sortMode === 'oldest') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    } else if (sortMode === 'updated') {
      const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(a.createdAt);
      const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(b.createdAt);
      return dateB - dateA;
    }
    return 0;
  });

  const todayStr = new Date().toLocaleDateString('en-CA');
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toLocaleDateString('en-CA');
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toLocaleDateString('en-CA');

  const createReminderEl = (rem) => {
    let freqText = '';
    if (rem.frequency.type === 'once') freqText = translations[currentLang].dynamicFreqOnce;
    else if (rem.frequency.type === 'day') freqText = translations[currentLang].dynamicFreqDay.replace('{x}', rem.frequency.num);
    else if (rem.frequency.type === 'week') freqText = translations[currentLang].dynamicFreqWeek.replace('{x}', rem.frequency.num).replace('{y}', rem.daysOfWeek.length);
    else if (rem.frequency.type === 'month') freqText = translations[currentLang].dynamicFreqMonth.replace('{x}', rem.frequency.num);

    let alarmText = '';
    if (rem.hasAlarm) {
      const formattedStart = formatDate(rem.startDate + 'T00:00:00Z').split(' ')[0];
      alarmText = ` | ${translations[currentLang].dynamicAlarmLabel}: ${rem.time} (${formattedStart})`;
    }

    let dueDateText = '';
    if (rem.dueDate) {
      const isOverdue = !rem.isCompleted && rem.dueDate < todayStr;
      const formattedDue = formatDate(rem.dueDate + 'T00:00:00Z').split(' ')[0];
      dueDateText = `<div class="reminder-meta mt-1 ${isOverdue ? 'text-overdue' : ''}">${translations[currentLang].dynamicDueLabel}: ${formattedDue}</div>`;
    }

    let dateText = '';
    if (rem.createdAt) {
      dateText += `<div class="card-date mt-2">${translations[currentLang].dynamicAdded}: ${formatDate(rem.createdAt)}</div>`;
    }
    if (rem.updatedAt) {
      dateText += `<div class="card-date mt-1">${translations[currentLang].dynamicUpdated}: ${formatDate(rem.updatedAt)}</div>`;
    }

    const isCompletedClass = rem.isCompleted ? 'completed' : '';

    const el = document.createElement('div');
    el.className = `reminder-item ${isCompletedClass}`;
    el.innerHTML = `
      <input type="checkbox" class="task-checkbox" data-id="${rem.id}" ${rem.isCompleted ? 'checked' : ''}>
      <div class="reminder-info" style="flex: 1;">
        <div class="reminder-title"><strong>${escapeHTML(rem.title)}</strong></div>
        ${rem.note ? `<div class="card-content mt-2">${escapeHTML(rem.note)}</div>` : ''}
        <div class="reminder-meta mt-2">${freqText}${alarmText}</div>
        ${dueDateText}
        ${dateText}
      </div>
      <button class="icon-btn delete-rem" data-id="${rem.id}"><i class="ms-Icon ms-Icon--Delete" aria-hidden="true"></i></button>
    `;
    el.querySelector('.reminder-info').addEventListener('click', () => window.openReminderDetails(rem.id));
    return el;
  };

  if (sortMode === 'dueDate' && currentTaskFilter !== 'completed') {
    const groups = {
      today: { title: translations[currentLang].dynamicGroupToday, items: [], color: 'var(--accent-color)' },
      yesterday: { title: translations[currentLang].dynamicGroupYesterday, items: [], color: '#d83b01' },
      overdue: { title: translations[currentLang].dynamicGroupOverdue, items: [], color: '#d83b01' },
      tomorrow: { title: translations[currentLang].dynamicGroupTomorrow, items: [], color: 'var(--text-color)' },
      later: { title: translations[currentLang].dynamicGroupLater, items: [], color: 'var(--text-color)' },
      nodate: { title: translations[currentLang].dynamicGroupNoDate, items: [], color: 'var(--text-secondary)' }
    };

    filteredReminders.forEach(rem => {
      if (rem.dueDate) {
        if (rem.dueDate === todayStr) groups.today.items.push(rem);
        else if (rem.dueDate === yesterdayStr) groups.yesterday.items.push(rem);
        else if (rem.dueDate < yesterdayStr) groups.overdue.items.push(rem);
        else if (rem.dueDate === tomorrowStr) groups.tomorrow.items.push(rem);
        else groups.later.items.push(rem);
      } else {
        groups.nodate.items.push(rem);
      }
    });

    Object.keys(groups).forEach(key => {
      const group = groups[key];
      if (group.items.length === 0) return;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'task-group';
      
      const header = document.createElement('div');
      header.className = 'task-group-header';
      if (key === 'overdue' || key === 'today') {
        header.style.color = group.color;
      }
      header.innerHTML = `
        <i class="ms-Icon ms-Icon--ChevronDown" aria-hidden="true"></i>
        ${group.title} <span class="task-group-count">${group.items.length}</span>
      `;
      
      const listDiv = document.createElement('div');
      listDiv.className = 'task-group-list';

      header.addEventListener('click', () => {
        groupDiv.classList.toggle('collapsed');
      });

      group.items.forEach(rem => {
        listDiv.appendChild(createReminderEl(rem));
      });
      
      groupDiv.appendChild(header);
      groupDiv.appendChild(listDiv);
      remindersContainer.appendChild(groupDiv);
    });
  } else {
    // Flat rendering for sorted views or 'completed' filter
    const listDiv = document.createElement('div');
    listDiv.className = 'task-group-list';
    listDiv.style.marginTop = '10px';
    filteredReminders.forEach(rem => {
      listDiv.appendChild(createReminderEl(rem));
    });
    remindersContainer.appendChild(listDiv);
  }

  if (window.api && window.api.setBadgeCount) {
    let activeTasksCount = 0;
    reminders.forEach(r => {
      if (!r.isCompleted && r.dueDate && r.dueDate <= todayStr) {
        activeTasksCount++;
      }
    });
    
    let dataUrl = null;
    let trayDataUrl = null;
    if (activeTasksCount > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.arc(16, 16, 16, 0, 2 * Math.PI);
      ctx.fillStyle = '#d83b01'; // Red badge
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px "Segoe UI"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(activeTasksCount > 99 ? '99+' : activeTasksCount.toString(), 16, 17);
      dataUrl = canvas.toDataURL('image/png');

      try {
        const trayCanvas = document.createElement('canvas');
        trayCanvas.width = 32;
        trayCanvas.height = 32;
        const tCtx = trayCanvas.getContext('2d');
        
        tCtx.fillStyle = '#0067c0';
        tCtx.beginPath();
        if (tCtx.roundRect) tCtx.roundRect(2, 2, 28, 28, 6);
        else tCtx.rect(2, 2, 28, 28);
        tCtx.fill();
        
        tCtx.strokeStyle = 'white';
        tCtx.lineWidth = 3;
        tCtx.lineCap = 'round';
        tCtx.lineJoin = 'round';
        tCtx.beginPath();
        tCtx.moveTo(9, 16);
        tCtx.lineTo(14, 21);
        tCtx.lineTo(23, 11);
        tCtx.stroke();
        
        tCtx.beginPath();
        tCtx.arc(24, 8, 8, 0, 2 * Math.PI);
        tCtx.fillStyle = '#d83b01';
        tCtx.fill();
        tCtx.fillStyle = 'white';
        tCtx.font = 'bold 10px "Segoe UI"';
        tCtx.textAlign = 'center';
        tCtx.textBaseline = 'middle';
        tCtx.fillText(activeTasksCount > 99 ? '!' : activeTasksCount.toString(), 24, 9);
        trayDataUrl = trayCanvas.toDataURL('image/png');
      } catch(e) {
        console.error('Tray badge error:', e);
      }
    }
    window.api.setBadgeCount({ count: activeTasksCount, dataUrl, trayDataUrl });
  }
  
  // Checkbox Event
  document.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      const rem = reminders.find(r => r.id === id);
      if (rem) {
        if (e.currentTarget.checked) {
          markTaskCompleted(rem);
        } else {
          rem.isCompleted = false;
          rem.isActive = true;
        }
        await saveData();
        renderReminders();
      }
    });
  });
  
  document.querySelectorAll('.delete-rem').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent card click
      const id = e.currentTarget.dataset.id;
      const isConfirmed = await showCustomConfirm(translations[currentLang].dynamicAlertConfirmDeleteTask);
      if (!isConfirmed) return;
      reminders = reminders.filter(n => n.id !== id);
      renderReminders();
      await saveData();
    });
  });
  
  const tasksCountEl = document.getElementById('sidebar-tasks-count');
  if (tasksCountEl) {
    tasksCountEl.textContent = reminders.length > 0 ? `(${reminders.length})` : '';
  }

  // Update sub-filter counts
  const updateCountUI = (id, count) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = count > 0 ? count : '';
      el.style.display = count > 0 ? 'inline-block' : 'none';
    }
  };

  const todayCount = reminders.filter(r => r.dueDate === filterTodayStr && !r.isCompleted).length;
  const tomorrowCount = reminders.filter(r => r.dueDate === filterTomorrowStr && !r.isCompleted).length;
  const yesterdayCount = reminders.filter(r => r.dueDate === filterYesterdayStr && !r.isCompleted).length;
  const olderCount = reminders.filter(r => r.dueDate && r.dueDate < filterYesterdayStr && !r.isCompleted).length;
  const upcomingCount = reminders.filter(r => r.dueDate && r.dueDate > filterTomorrowStr && !r.isCompleted).length;
  const completedCount = reminders.filter(r => r.isCompleted).length;
  const nodateCount = reminders.filter(r => !r.dueDate && !r.isCompleted).length;

  updateCountUI('count-today', todayCount);
  updateCountUI('count-tomorrow', tomorrowCount);
  updateCountUI('count-yesterday', yesterdayCount);
  updateCountUI('count-older', olderCount);
  updateCountUI('count-upcoming', upcomingCount);
  updateCountUI('count-completed', completedCount);
  updateCountUI('count-nodate', nodateCount);
}

window.openReminderDetails = function(id) {
  const rem = reminders.find(r => r.id === id);
  if (!rem) return;
  
  currentEditingReminderId = id;
  document.getElementById('reminder-modal-title').textContent = translations[currentLang].dynamicTaskDetail;
  reminderTitle.value = rem.title;
  reminderNote.value = rem.note || '';
  taskDueDate.value = rem.dueDate || '';
  taskHasAlarm.checked = !!rem.hasAlarm;
  alarmSettingsContainer.style.display = rem.hasAlarm ? 'block' : 'none';
  reminderFreqNum.value = rem.frequency.num;
  reminderFreqType.value = rem.frequency.type;
  reminderTime.value = rem.time || new Date().toTimeString().slice(0, 5);
  reminderStartDate.value = rem.startDate || new Date().toLocaleDateString('en-CA');
  
  if (rem.endDate) {
    document.querySelector('input[name="end-type"][value="date"]').checked = true;
    reminderEndDate.disabled = false;
    reminderEndDate.value = rem.endDate;
  } else {
    document.querySelector('input[name="end-type"][value="never"]').checked = true;
    reminderEndDate.disabled = true;
    reminderEndDate.value = '';
  }
  
  updateReminderTypeUI(rem.frequency.type);
  
  // Set days
  if (rem.frequency.type === 'week') {
    weekDaysSelector.style.display = 'flex';
    dayBtns.forEach(btn => {
      const dayVal = parseInt(btn.dataset.day);
      if (rem.daysOfWeek.includes(dayVal)) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });
  } else {
    weekDaysSelector.style.display = 'none';
  }
  
  setReminderModalMode(true);
  openModal(reminderModal);
};

window.openSimpleAlert = function(id) {
  const rem = reminders.find(r => r.id === id);
  if (!rem) return;
  
  const alertModal = document.getElementById('alert-modal');
  document.getElementById('alert-task-title').textContent = rem.title;
  document.getElementById('alert-task-desc').textContent = rem.note || '';
  
  const snoozeBtn = document.getElementById('alert-snooze-btn');
  const completeBtn = document.getElementById('alert-complete-btn');
  
  const duration = parseInt(settings.snoozeDuration) || 5;
  snoozeBtn.textContent = `${translations[currentLang].modalAlertSnoozePrefix} (${duration} dk)`;
  
  snoozeBtn.onclick = async () => {
    rem.snoozedUntil = Date.now() + duration * 60000;
    await saveData();
    closeModal(alertModal);
    if (window.api && window.api.showAlert) {
      window.api.showAlert(translations[currentLang].dynamicAlertSnoozed.replace('{x}', duration));
    }
  };
  
  completeBtn.onclick = async () => {
    markTaskCompleted(rem);
    await saveData();
    renderReminders();
    closeModal(alertModal);
  };
  
  openModal(alertModal);
};

// --- Background Checker ---
function setupRemindersCheck() {
  setInterval(() => {
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD local
    const currentTimeStr = now.toTimeString().slice(0, 5); // HH:MM
    const currentDayOfWeek = now.getDay(); // 0-6 (Sun-Sat)
    
    reminders.forEach(async rem => {
      if (!rem.isActive || rem.isCompleted || !rem.hasAlarm) return;
      
      // Check start date
      if (currentDateStr < rem.startDate) return;
      
      // Check end date
      if (rem.endDate && currentDateStr > rem.endDate) {
        rem.isActive = false;
        await saveData();
        return;
      }
      
      let isSnoozeTrigger = false;
      let triggerId = `${currentDateStr}-${currentTimeStr}`;
      
      if (rem.snoozedUntil && Date.now() >= rem.snoozedUntil) {
        isSnoozeTrigger = true;
        rem.snoozedUntil = null; // Clear it, if they snooze again it will be re-set
      }

      if (!isSnoozeTrigger) {
        // Check time
        if (rem.time !== currentTimeStr) return;
        
        // Check if already triggered this minute (prevent multiple triggers)
        if (rem.lastTriggered === triggerId) return;
      }
      
      // Logic for frequency
      let shouldTrigger = false;
      
      if (isSnoozeTrigger) {
        shouldTrigger = true;
      } else {
        // Helper to calculate exact days difference locally
        const getLocalDaysDiff = (startStr, currentStr) => {
          const [sY, sM, sD] = startStr.split('-').map(Number);
          const [cY, cM, cD] = currentStr.split('-').map(Number);
          const d1 = new Date(sY, sM - 1, sD);
          const d2 = new Date(cY, cM - 1, cD);
          return Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
        };

        if (rem.frequency.type === 'once') {
          if (currentDateStr === rem.startDate) shouldTrigger = true;
        } else if (rem.frequency.type === 'day') {
          const diffDays = getLocalDaysDiff(rem.startDate, currentDateStr);
          if (diffDays % rem.frequency.num === 0) shouldTrigger = true;
        } else if (rem.frequency.type === 'week') {
          if (rem.daysOfWeek.includes(currentDayOfWeek)) {
            const diffDays = getLocalDaysDiff(rem.startDate, currentDateStr);
            const diffWeeks = Math.floor(diffDays / 7);
            if (diffWeeks % rem.frequency.num === 0) shouldTrigger = true;
          }
        } else if (rem.frequency.type === 'month') {
          const [sY, sM, sD] = rem.startDate.split('-').map(Number);
          const [cY, cM, cD] = currentDateStr.split('-').map(Number);
          const diffMonths = (cY - sY) * 12 + (cM - sM);
          if (diffMonths % rem.frequency.num === 0 && cD === sD) {
            shouldTrigger = true;
          }
        }
      }
      
      if (shouldTrigger) {
        if (window.api) {
          if (window.api.showNotification) {
            window.api.showNotification({
              id: rem.id,
              title: `${translations[currentLang].modalAlertTitle}: ${rem.title}`,
              body: rem.note || translations[currentLang].dynamicAlertDue
            });
          } else if (window.api.showAlert) {
            window.api.showAlert(`${translations[currentLang].modalAlertTitle}: ${rem.title}\n${rem.note || ''}`);
          }
        } else {
          alert(`${translations[currentLang].modalAlertTitle}: ${rem.title}\n${rem.note || ''}`);
        }
        
        rem.lastTriggered = triggerId;
        await saveData();
      }
    });
  }, 1000); // Check every 1 second
}

async function saveData() {
  if (window.api) {
    await window.api.saveData({ notes, reminders, settings });
  }
}

init();
