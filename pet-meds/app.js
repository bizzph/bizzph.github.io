(() => {
  'use strict';

  const STORAGE_KEY = 'petmed.pwa.v1';
  const DEFAULT_STATE = {
    pets: [],
    medications: [],
    logs: [],
    caregivers: [{ id: 'me', name: 'Me', role: 'Owner' }],
    reminderMarkers: {},
    settings: {
      ownerName: '',
      remindersEnabled: true,
      reminderLeadMinutes: 0,
      lateAfterMinutes: 30,
      activeCaregiverId: 'me'
    }
  };

  let state = loadState();
  let route = 'today';
  let installPrompt = null;
  let notificationTimer = null;

  const app = document.getElementById('app');
  const pageTitle = document.getElementById('pageTitle');
  const modal = document.getElementById('modal');
  const modalForm = document.getElementById('modalForm');
  const modalTitle = document.getElementById('modalTitle');
  const modalEyebrow = document.getElementById('modalEyebrow');
  const modalBody = document.getElementById('modalBody');
  const toastEl = document.getElementById('toast');
  const installBtn = document.getElementById('installBtn');

  function uid(prefix='id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        caregivers: Array.isArray(parsed.caregivers) && parsed.caregivers.length ? parsed.caregivers : structuredClone(DEFAULT_STATE.caregivers)
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function esc(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function dateFromKey(key) {
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y, m-1, d, 12, 0, 0, 0);
  }

  function minutesFromTime(t='00:00') {
    const [h,m] = t.split(':').map(Number);
    return (h*60)+m;
  }

  function formatTime(time) {
    const [h,m] = time.split(':').map(Number);
    return new Intl.DateTimeFormat([], { hour:'numeric', minute:'2-digit' }).format(new Date(2000,0,1,h,m));
  }

  function formatDate(key) {
    return new Intl.DateTimeFormat([], { month:'short', day:'numeric', year:'numeric' }).format(dateFromKey(key));
  }

  function petById(id) { return state.pets.find(p => p.id === id); }
  function medById(id) { return state.medications.find(m => m.id === id); }
  function caregiverById(id) { return state.caregivers.find(c => c.id === id); }

  function readLocalImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file'));
      if (file.size > 1500000) return reject(new Error('Image must be smaller than 1.5 MB for localStorage'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.readAsDataURL(file);
    });
  }

  function avatarFor(pet) {
    if (pet?.photo) return `<span class="avatar"><img src="${esc(pet.photo)}" alt="${esc(pet.name)}"></span>`;
    const speciesIcon = { dog:'🐶', cat:'🐱', rabbit:'🐰', bird:'🐦' }[String(pet?.species || '').toLowerCase()] || '🐾';
    return `<span class="avatar" aria-hidden="true">${speciesIcon}</span>`;
  }

  function medThumb(med) {
    if (med?.photo) return `<span class="mini-med"><img src="${esc(med.photo)}" alt="${esc(med.name)}"></span>`;
    const icon = med?.type === 'Liquid' ? '🧴' : med?.type === 'Drops' ? '💧' : med?.type === 'Injection' ? '💉' : med?.type === 'Topical' ? '🧴' : '💊';
    return `<span class="mini-med" aria-hidden="true">${icon}</span>`;
  }

  function medAvatar(med) {
    if (med?.photo) return `<span class="avatar"><img src="${esc(med.photo)}" alt="${esc(med.name)}"></span>`;
    const icon = med?.type === 'Liquid' ? '🧴' : med?.type === 'Drops' ? '💧' : med?.type === 'Injection' ? '💉' : med?.type === 'Topical' ? '🧴' : '💊';
    return `<span class="avatar" aria-hidden="true">${icon}</span>`;
  }

  function recurrenceMatches(med, key) {
    const d = dateFromKey(key);
    if (med.startDate && key < med.startDate) return false;
    if (med.endDate && key > med.endDate) return false;
    const rec = med.recurrence || 'daily';
    if (rec === 'daily') return true;
    if (rec === 'weekly') return (med.daysOfWeek || []).includes(d.getDay());
    if (rec === 'interval') {
      const start = dateFromKey(med.startDate || key);
      const days = Math.floor((d - start)/86400000);
      return days >= 0 && days % Math.max(1, Number(med.intervalDays || 1)) === 0;
    }
    if (rec === 'once') return key === med.startDate;
    if (rec === 'asneeded') return false;
    return true;
  }

  function doseKey(medId, dateKey, time) { return `${medId}|${dateKey}|${time}`; }

  function scheduledDosesForDate(key) {
    const doses = [];
    for (const med of state.medications) {
      if (!med.active || !recurrenceMatches(med, key)) continue;
      for (const time of (med.times || [])) {
        doses.push({ med, pet: petById(med.petId), dateKey: key, time, key: doseKey(med.id,key,time) });
      }
    }
    return doses.sort((a,b) => minutesFromTime(a.time) - minutesFromTime(b.time));
  }

  function logForDose(dose) {
    return state.logs.find(l => l.doseKey === dose.key);
  }

  function doseStatus(dose, now = new Date()) {
    const log = logForDose(dose);
    if (log) return log.status;
    if (dose.dateKey < todayKey(now)) return 'missed';
    if (dose.dateKey > todayKey(now)) return 'upcoming';
    const current = now.getHours()*60 + now.getMinutes();
    const scheduled = minutesFromTime(dose.time);
    if (current < scheduled) return 'upcoming';
    if (current <= scheduled + Number(state.settings.lateAfterMinutes || 30)) return 'due';
    return 'late';
  }

  function statusLabel(status) {
    return ({ upcoming:'Upcoming', due:'Due now', given:'Given', late:'Late', missed:'Missed', skipped:'Skipped' })[status] || status;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function openModal({ eyebrow='', title='', body='' }) {
    modalEyebrow.textContent = eyebrow;
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    if (!modal.open) modal.showModal();
  }

  function closeModal() { if (modal.open) modal.close(); }

  function setRoute(next) {
    route = next;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.route === route));
    render();
  }

  function render() {
    const titleMap = { today:'Today', pets:'Pets', medications:'Medicines', history:'History', profile:'More' };
    pageTitle.textContent = titleMap[route] || 'PetMed';
    if (route === 'today') renderToday();
    if (route === 'pets') renderPets();
    if (route === 'medications') renderMedications();
    if (route === 'history') renderHistory();
    if (route === 'profile') renderProfile();
  }

  function renderToday() {
    const key = todayKey();
    const doses = scheduledDosesForDate(key);

    if (!state.pets.length) {
      app.innerHTML = `
        <section class="hero">
          <p class="eyebrow">Welcome</p>
          <h2>Let’s set up your pet’s medicine</h2>
          <p>You only need a pet name and medicine details to get started. Extra information is optional.</p>
          <div class="start-steps">
            <div class="start-step"><span class="step-number">1</span><div><strong>Add your pet</strong><p>Start with their name.</p></div></div>
            <div class="start-step"><span class="step-number">2</span><div><strong>Add a medicine</strong><p>Enter the dose and when to give it.</p></div></div>
            <div class="start-step"><span class="step-number">3</span><div><strong>Tap “Mark as given”</strong><p>That’s how you avoid double doses.</p></div></div>
          </div>
          <div class="actions"><button class="btn full" data-action="add-pet">Add my pet</button></div>
        </section>`;
      bindActions();
      return;
    }

    if (!state.medications.length) {
      const pet = state.pets[0];
      app.innerHTML = `
        <section class="hero">
          <p class="eyebrow">Next step</p>
          <h2>${esc(pet.name)} is added ✓</h2>
          <p>Now add the medicine, the amount to give, and the time. You can skip everything else.</p>
          <div class="start-steps">
            <div class="start-step done"><span class="step-number">✓</span><div><strong>Pet added</strong><p>${esc(pet.name)}</p></div></div>
            <div class="start-step"><span class="step-number">2</span><div><strong>Add a medicine</strong><p>Name, dose, and time are enough.</p></div></div>
            <div class="start-step"><span class="step-number">3</span><div><strong>Use Today</strong><p>Mark each dose when you give it.</p></div></div>
          </div>
          <div class="actions"><button class="btn full" data-action="add-med">Add ${esc(pet.name)}’s medicine</button></div>
        </section>`;
      bindActions();
      return;
    }

    app.innerHTML = `
      ${doses.length ? `
        <div class="section-title"><h2>What ${state.pets.length > 1 ? 'your pets need' : `${esc(state.pets[0].name)} needs`} today</h2><span class="small muted">${esc(formatDate(key))}</span></div>
        <section class="dose-list">${doses.map(doseCard).join('')}</section>` : `
        <section class="card empty"><div class="emoji">✅</div><h2>Nothing scheduled today</h2><p>There are no doses to give today.</p></section>`}

      <div class="actions"><button class="btn secondary full" data-action="view-history">See dose history</button></div>
      <section class="notice info" style="margin-top:14px">Missed a dose? Follow your veterinarian’s instructions. Don’t double the next dose unless they told you to.</section>`;
    bindActions();
  }

  function doseCard(dose) {
    const status = doseStatus(dose);
    const log = logForDose(dose);
    const caregiver = log ? caregiverById(log.caregiverId) : null;
    const med = dose.med;
    return `
      <article class="card dose ${['due','late','missed'].includes(status) ? 'primary-task' : ''}">
        ${avatarFor(dose.pet)}
        <div class="dose-main">
          <div class="dose-top">
            <div>
              <h3>${esc(dose.pet?.name || 'Pet')}</h3>
              <div class="dose-time">${esc(formatTime(dose.time))}</div>
              <p class="medline med-ident">${medThumb(med)} <span><strong>${esc(med.nickname || med.name)}</strong> · ${esc(med.doseAmount || '')}</span></p>
              ${med.instructions ? `<p class="small muted plain-copy">${esc(med.instructions)}</p>` : ''}
            </div>
            <span class="status ${status}">${statusLabel(status)}</span>
          </div>
          ${log ? `<div class="meta"><span>✓ Recorded ${esc(log.actualTime || '')}${caregiver ? ` by ${esc(caregiver.name)}` : ''}</span></div>` : ''}
          <div class="actions">
            ${['upcoming','due','late','missed'].includes(status) ? `<button class="btn" data-action="give-dose" data-dose="${esc(dose.key)}">Mark as given</button><button class="btn secondary" data-action="dose-options" data-dose="${esc(dose.key)}">Other options</button>` : `<button class="btn secondary" data-action="dose-options" data-dose="${esc(dose.key)}">View</button>`}
          </div>
        </div>
      </article>`;
  }

  function renderPets() {
    app.innerHTML = `
      <div class="section-title"><h2>Your pets</h2><button class="btn" data-action="add-pet">Add pet</button></div>
      ${state.pets.length ? `<section class="grid">${state.pets.map(p => `
        <article class="card pet-card">
          ${avatarFor(p)}
          <div class="grow"><h3>${esc(p.name)}</h3><p class="small muted">${esc(p.species || 'Pet')}${p.breed ? ` · ${esc(p.breed)}`:''}</p><div class="actions"><button class="btn secondary" data-action="edit-pet" data-id="${esc(p.id)}">Edit</button><button class="btn ghost" data-action="pet-summary" data-id="${esc(p.id)}">Health summary</button></div></div>
        </article>`).join('')}</section>` : `<section class="card empty"><div class="emoji">🐶</div><h2>No pets yet</h2><p>Create a pet profile to start tracking medication.</p></section>`}`;
    bindActions();
  }

  function renderMedications() {
    const meds = state.medications;
    app.innerHTML = `
      <div class="section-title"><h2>Your medicines</h2><button class="btn" data-action="add-med" ${state.pets.length?'':'disabled'}>Add medicine</button></div>
      ${!state.pets.length ? `<section class="notice">First add a pet. Then you can add their medicine.</section>` : ''}
      ${meds.length ? `<section class="grid">${meds.map(m => {
        const p = petById(m.petId);
        return `<article class="card med-card">
          ${medAvatar(m)}
          <div class="grow"><h3>${esc(m.nickname || m.name)}</h3><p class="small muted">For ${esc(p?.name || 'pet')} · ${esc(m.doseAmount || '')}</p><p class="small muted">${(m.times||[]).map(formatTime).join(' and ') || 'Give only when needed'}</p><div class="actions"><button class="btn secondary" data-action="edit-med" data-id="${esc(m.id)}">Edit</button>${m.recurrence==='asneeded'?`<button class="btn ghost" data-action="log-prn" data-id="${esc(m.id)}">Record a dose</button>`:''}</div></div>
          <span class="pill">${m.active ? 'Active' : 'Paused'}</span>
        </article>`;
      }).join('')}</section>` : `<section class="card empty"><div class="emoji">💊</div><h2>No medicines yet</h2><p>Add one medicine with the amount and time to give it.</p></section>`}`;
    bindActions();
  }

  function renderHistory() {
    const items = [...state.logs].sort((a,b) => (`${b.dateKey} ${b.actualTime||b.scheduledTime}`).localeCompare(`${a.dateKey} ${a.actualTime||a.scheduledTime}`));
    app.innerHTML = `
      <div class="section-title"><h2>Dose history</h2><button class="btn secondary" data-action="go-more">Back</button></div>
      ${items.length ? `<section class="timeline">${items.map(log => {
        const med = medById(log.medId); const pet = petById(log.petId); const cg = caregiverById(log.caregiverId);
        return `<div class="timeline-row"><div class="timeline-time">${esc(formatDate(log.dateKey))}<br>${esc(log.actualTime || formatTime(log.scheduledTime))}</div><div class="timeline-card"><div class="split"><strong>${esc(pet?.name || '')} · ${esc(med?.nickname || med?.name || 'Medication')}</strong><span class="status ${esc(log.status)}">${statusLabel(log.status)}</span></div><p class="small muted">${esc(med?.doseAmount || '')}${cg ? ` · ${esc(cg.name)}` : ''}${log.note ? ` · ${esc(log.note)}`:''}</p></div></div>`;
      }).join('')}</section>` : `<section class="card empty"><div class="emoji">🗂️</div><h2>No history yet</h2><p>Recorded doses will appear here for review with your veterinarian.</p></section>`}`;
    bindActions();
  }

  function renderProfile() {
    const notificationLabel = typeof Notification === 'undefined'
      ? 'Notifications not available'
      : Notification.permission === 'granted' ? 'Phone notifications are on'
      : Notification.permission === 'denied' ? 'Notifications are blocked'
      : 'Turn on phone notifications';
    app.innerHTML = `
      <section class="grid">
        <article class="card">
          <h2>Quick links</h2>
          <div class="more-menu">
            <button class="menu-row" data-action="view-history"><span>Dose history</span><span>›</span></button>
            <button class="menu-row" data-action="add-caregiver"><span>Add another person</span><span>›</span></button>
            <button class="menu-row" data-action="export-data"><span>Back up my data</span><span>›</span></button>
            <button class="menu-row" data-action="import-data"><span>Restore a backup</span><span>›</span></button>
          </div>
        </article>
        <article class="card">
          <h2>Who is giving medicines?</h2>
          <p class="small muted">We save this name with each recorded dose.</p>
          <div class="form-grid"><label>Current caregiver<select id="activeCaregiver">${state.caregivers.map(c => `<option value="${esc(c.id)}" ${c.id===state.settings.activeCaregiverId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label></div>
        </article>
        <article class="card">
          <h2>Reminders</h2>
          <p class="small muted">This app can remind you while it is open. Phone browsers may stop reminders after the app is fully closed.</p>
          <div class="form-grid">
            <label class="checkline"><input id="remindersEnabled" type="checkbox" ${state.settings.remindersEnabled?'checked':''}> Remind me when a dose is due</label>
          </div>
          <div class="actions"><button class="btn secondary" data-action="request-notifications">${esc(notificationLabel)}</button></div>
        </article>
        <article class="card">
          <h2>Your privacy</h2>
          <p class="small muted">Your pet and medicine information stays in this browser on this device. There is no account or cloud database.</p>
          <details class="optional"><summary>Advanced data options</summary><div class="optional-body"><div class="actions"><button class="btn danger" data-action="reset-data">Delete all app data</button></div></div></details>
        </article>
        <article class="card">
          <h2>Put this app on your phone</h2>
          <p class="small muted">On iPhone/iPad: Safari → Share → Add to Home Screen. On Android: use your browser’s Install app option.</p>
        </article>
      </section>`;
    bindActions();
    const active = document.getElementById('activeCaregiver');
    if (active) active.addEventListener('change', e => { state.settings.activeCaregiverId = e.target.value; saveState(); toast('Caregiver updated'); });
    const re = document.getElementById('remindersEnabled');
    if (re) re.addEventListener('change', e => { state.settings.remindersEnabled = e.target.checked; saveState(); setupReminderLoop(); toast(e.target.checked ? 'Reminders on' : 'Reminders off'); });
  }

  function petForm(pet={}) {
    return `
      <p class="small muted plain-copy">Start with the basics. You can add health details later.</p>
      <div class="form-grid">
        <label>Pet name<input name="name" required maxlength="60" autocomplete="off" placeholder="e.g. Bailey" value="${esc(pet.name||'')}"></label>
        <label>What kind of pet?<select name="species" data-current="${esc(pet.species||'Dog')}"><option>Dog</option><option>Cat</option><option>Rabbit</option><option>Bird</option><option>Other</option></select></label>
        <label>Photo <span class="hint">Optional — useful if you have more than one pet.</span><input name="photo" type="file" accept="image/*"></label>
        ${pet.photo ? `<div class="photo-preview">${avatarFor(pet)}<span class="small muted">Current photo</span></div>` : ''}
      </div>
      <details class="optional" ${pet.id && (pet.breed || pet.birthDate || pet.weight || pet.allergies || pet.conditions || pet.vet || pet.notes) ? 'open' : ''}>
        <summary>More pet details (optional)</summary>
        <div class="optional-body form-grid">
          <label>Breed<input name="breed" maxlength="80" value="${esc(pet.breed||'')}"></label>
          <label>Birth date<input type="date" name="birthDate" value="${esc(pet.birthDate||'')}"></label>
          <div class="form-grid two"><label>Weight<input name="weight" inputmode="decimal" value="${esc(pet.weight||'')}"></label><label>Unit<select name="weightUnit" data-current="${esc(pet.weightUnit||'kg')}"><option value="kg">kg</option><option value="lb">lb</option></select></label></div>
          <label>Allergies<textarea name="allergies" placeholder="Leave blank if none">${esc(pet.allergies||'')}</textarea></label>
          <label>Health conditions<textarea name="conditions">${esc(pet.conditions||'')}</textarea></label>
          <label>Veterinarian / clinic<input name="vet" value="${esc(pet.vet||'')}"></label>
          <label>Notes<textarea name="notes">${esc(pet.notes||'')}</textarea></label>
        </div>
      </details>
      <div class="actions"><button class="btn full" type="button" data-modal-save="pet" data-id="${esc(pet.id||'')}">Save pet</button>${pet.id?`<button class="btn ghost full" type="button" data-delete-pet="${esc(pet.id)}">Delete this pet</button>`:''}</div>`;
  }

  function medicationForm(med={}) {
    const selectedPet = med.petId || state.pets[0]?.id || '';
    const times = med.times || ['08:00'];
    const recurrence = med.recurrence || 'daily';
    const weekdays = med.daysOfWeek || [];
    const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `
      <p class="small muted plain-copy">Only the medicine name, amount, and schedule are needed.</p>
      <div class="form-grid">
        <label>Who is this for?<select name="petId" data-current="${esc(selectedPet)}">${state.pets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
        <label>Medicine name<input name="name" required autocomplete="off" placeholder="Name on the label" value="${esc(med.name||'')}"></label>
        <label>How much do you give?<span class="hint">Write it the way you normally say it.</span><input name="doseAmount" required placeholder="e.g. 1 tablet or 2 mL" value="${esc(med.doseAmount||'')}"></label>
        <label>How often?<select name="recurrence" id="recurrenceSelect" data-current="${esc(recurrence)}"><option value="daily">Every day</option><option value="weekly">Certain days of the week</option><option value="interval">Every few days</option><option value="once">One time only</option><option value="asneeded">Only when needed</option></select></label>

        <div class="schedule-panel" data-schedule="timed">
          <label>What time?<input name="time1" type="time" value="${esc(times[0]||'08:00')}"></label>
          <div class="form-grid two">
            <label>Another time <span class="hint">Optional</span><input name="time2" type="time" value="${esc(times[1]||'')}"></label>
            <label>One more time <span class="hint">Optional</span><input name="time3" type="time" value="${esc(times[2]||'')}"></label>
          </div>
        </div>

        <div class="schedule-panel" data-schedule="weekly" hidden>
          <label>Which days?</label>
          <div class="weekday-grid">${weekdayNames.map((day,i) => `<label class="weekday-choice"><input type="checkbox" name="day${i}" ${weekdays.includes(i)?'checked':''}>${day}</label>`).join('')}</div>
        </div>

        <div class="schedule-panel" data-schedule="interval" hidden>
          <label>Give every how many days?<input name="intervalDays" type="number" min="1" max="365" value="${esc(med.intervalDays||2)}"></label>
        </div>

        <div class="schedule-panel" data-schedule="once" hidden>
          <label>Which date?<input type="date" name="oneTimeDate" value="${esc(med.startDate||todayKey())}"></label>
        </div>

        <label>How should it be given? <span class="hint">Optional</span><textarea name="instructions" placeholder="e.g. Give with food">${esc(med.instructions||'')}</textarea></label>
      </div>

      <details class="optional" ${med.id && (med.nickname || med.strength || med.endDate || med.prescriber || med.pharmacy || med.notes || med.photo || med.refillQuantity !== '' && med.refillQuantity != null) ? 'open' : ''}>
        <summary>More medicine details (optional)</summary>
        <div class="optional-body form-grid">
          <label>Easy name or description<span class="hint">For example “pink heart pill”.</span><input name="nickname" placeholder="Pink heart pill" value="${esc(med.nickname||'')}"></label>
          <label>Type<select name="type" data-current="${esc(med.type||'Tablet')}"><option>Tablet</option><option>Capsule</option><option>Liquid</option><option>Drops</option><option>Injection</option><option>Topical</option><option>Other</option></select></label>
          <label>Strength<input name="strength" placeholder="e.g. 20 mg" value="${esc(med.strength||'')}"></label>
          <div class="form-grid two"><label>Start date<input type="date" name="startDate" value="${esc(med.startDate||todayKey())}"></label><label>End date<input type="date" name="endDate" value="${esc(med.endDate||'')}"></label></div>
          <label>Medicine or package photo<input name="photo" type="file" accept="image/*"></label>
          ${med.photo ? `<div class="photo-preview">${medAvatar(med)}<span class="small muted">Current photo</span></div>` : ''}
          <div class="form-grid two"><label>How many are left?<input name="refillQuantity" type="number" min="0" value="${esc(med.refillQuantity??'')}"></label><label>Remind me when this many are left<input name="refillThreshold" type="number" min="0" value="${esc(med.refillThreshold??5)}"></label></div>
          <label>Prescribing veterinarian<input name="prescriber" value="${esc(med.prescriber||'')}"></label>
          <label>Pharmacy<input name="pharmacy" value="${esc(med.pharmacy||'')}"></label>
          <label>Notes<textarea name="notes">${esc(med.notes||'')}</textarea></label>
          <label class="checkline"><input name="active" type="checkbox" ${med.active===false?'':'checked'}> This medicine is active</label>
        </div>
      </details>
      <div class="notice info" style="margin-top:14px">If a dose is missed, follow your veterinarian’s instructions. Do not double a dose unless they specifically told you to.</div>
      <div class="actions"><button class="btn full" type="button" data-modal-save="med" data-id="${esc(med.id||'')}">Save medicine</button>${med.id?`<button class="btn ghost full" type="button" data-delete-med="${esc(med.id)}">Delete this medicine</button>`:''}</div>`;
  }

  function bindActions() {
    app.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handleAction));
  }

  function findDoseByKey(key) {
    for (const d of scheduledDosesForDate(todayKey())) if (d.key === key) return d;
    const [medId,dateKey,time] = key.split('|');
    const med = medById(medId);
    return med ? { med, pet: petById(med.petId), dateKey, time, key } : null;
  }

  function handleAction(e) {
    const action = e.currentTarget.dataset.action;
    const id = e.currentTarget.dataset.id;
    if (action === 'add-pet') {
      openModal({ eyebrow:'Step 1', title:'Add your pet', body:petForm() }); bindModalControls();
    }
    if (action === 'edit-pet') {
      const pet = petById(id); openModal({ eyebrow:'Pet profile', title:`Edit ${pet?.name||'pet'}`, body:petForm(pet) }); bindModalControls();
    }
    if (action === 'add-med') {
      openModal({ eyebrow:'Step 2', title:'Add a medicine', body:medicationForm() }); bindModalControls();
    }
    if (action === 'edit-med') {
      const med = medById(id); openModal({ eyebrow:'Medicine', title:`Edit ${med?.nickname||med?.name||'medicine'}`, body:medicationForm(med) }); bindModalControls();
    }
    if (action === 'give-dose') recordDose(e.currentTarget.dataset.dose, 'given');
    if (action === 'dose-options') showDoseOptions(e.currentTarget.dataset.dose);
    if (action === 'log-prn') logPrn(id);
    if (action === 'refill-med') showRefill(id);
    if (action === 'pet-summary') showPetSummary(id);
    if (action === 'add-caregiver') showCaregiverForm();
    if (action === 'request-notifications') requestNotifications();
    if (action === 'export-data') exportData();
    if (action === 'import-data') importData();
    if (action === 'reset-data') resetData();
    if (action === 'view-history') setRoute('history');
    if (action === 'go-more') setRoute('profile');
  }

  function bindModalControls() {
    modalBody.querySelectorAll('select[data-current]').forEach(sel => { if (sel.dataset.current) sel.value = sel.dataset.current; });
    const recurrenceSelect = modalBody.querySelector('#recurrenceSelect');
    const updateSchedulePanels = () => {
      if (!recurrenceSelect) return;
      const value = recurrenceSelect.value;
      modalBody.querySelectorAll('[data-schedule="timed"]').forEach(el => { el.hidden = value === 'asneeded'; });
      modalBody.querySelectorAll('[data-schedule="weekly"]').forEach(el => { el.hidden = value !== 'weekly'; });
      modalBody.querySelectorAll('[data-schedule="interval"]').forEach(el => { el.hidden = value !== 'interval'; });
      modalBody.querySelectorAll('[data-schedule="once"]').forEach(el => { el.hidden = value !== 'once'; });
    };
    if (recurrenceSelect) { recurrenceSelect.addEventListener('change', updateSchedulePanels); updateSchedulePanels(); }
    modalBody.querySelectorAll('[data-modal-save="pet"]').forEach(btn => btn.addEventListener('click', () => savePet(btn.dataset.id)));
    modalBody.querySelectorAll('[data-modal-save="med"]').forEach(btn => btn.addEventListener('click', () => saveMed(btn.dataset.id)));
    modalBody.querySelectorAll('[data-delete-pet]').forEach(btn => btn.addEventListener('click', () => deletePet(btn.dataset.deletePet)));
    modalBody.querySelectorAll('[data-delete-med]').forEach(btn => btn.addEventListener('click', () => deleteMed(btn.dataset.deleteMed)));
    modalBody.querySelectorAll('[data-dose-status]').forEach(btn => btn.addEventListener('click', () => recordDose(btn.dataset.dose, btn.dataset.doseStatus, formDataObject())));
    modalBody.querySelectorAll('[data-save-refill]').forEach(btn => btn.addEventListener('click', () => saveRefill(btn.dataset.saveRefill)));
    modalBody.querySelectorAll('[data-save-caregiver]').forEach(btn => btn.addEventListener('click', saveCaregiver));
  }

  function formDataObject() {
    return Object.fromEntries(new FormData(modalForm).entries());
  }

  async function savePet(id) {
    const data = formDataObject();
    if (!data.name?.trim()) return toast('Pet name is required');
    const existing = petById(id);
    let photo = existing?.photo || '';
    try { if (modalForm.elements.photo?.files?.[0]) photo = await readLocalImage(modalForm.elements.photo.files[0]); }
    catch (err) { return toast(err.message); }
    const pet = {
      id: id || uid('pet'), name:data.name.trim(), species:data.species || 'Dog', breed:String(data.breed || '').trim(), birthDate:data.birthDate || '',
      weight:String(data.weight || '').trim(), weightUnit:data.weightUnit || 'kg', allergies:String(data.allergies || '').trim(), conditions:String(data.conditions || '').trim(), vet:String(data.vet || '').trim(), notes:String(data.notes || '').trim(), photo
    };
    const idx = state.pets.findIndex(p => p.id === id);
    if (idx >= 0) state.pets[idx] = pet; else state.pets.push(pet);
    saveState(); closeModal(); render(); toast('Pet saved');
  }

  async function saveMed(id) {
    const data = formDataObject();
    if (!data.name?.trim() || !data.doseAmount?.trim()) return toast('Add the medicine name and amount');
    const recurrence = data.recurrence || 'daily';
    const times = recurrence === 'asneeded' ? [] : [data.time1, data.time2, data.time3].map(t => String(t || '').trim()).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    if (recurrence !== 'asneeded' && !times.length) return toast('Choose at least one time');
    const days = Array.from({length:7}, (_,i) => i).filter(i => modalForm.elements[`day${i}`]?.checked);
    if (recurrence === 'weekly' && !days.length) return toast('Choose at least one day of the week');
    const existing = medById(id);
    let photo = existing?.photo || '';
    try { if (modalForm.elements.photo?.files?.[0]) photo = await readLocalImage(modalForm.elements.photo.files[0]); }
    catch (err) { return toast(err.message); }
    const startDate = recurrence === 'once' ? (data.oneTimeDate || todayKey()) : (data.startDate || existing?.startDate || todayKey());
    const med = {
      id:id || uid('med'), petId:data.petId || state.pets[0]?.id, name:data.name.trim(), nickname:String(data.nickname || '').trim(), type:data.type || 'Tablet', doseAmount:data.doseAmount.trim(), strength:String(data.strength || '').trim(),
      startDate, endDate:data.endDate || '', recurrence, times, intervalDays:Math.max(1,Number(data.intervalDays)||2), daysOfWeek:days,
      refillQuantity:data.refillQuantity == null || data.refillQuantity === '' ? '' : Math.max(0,Number(data.refillQuantity)||0), refillThreshold:Math.max(0,Number(data.refillThreshold)||5),
      instructions:String(data.instructions || '').trim(), prescriber:String(data.prescriber || '').trim(), pharmacy:String(data.pharmacy || '').trim(), notes:String(data.notes || '').trim(), active:modalForm.elements.active ? modalForm.elements.active.checked : true, photo
    };
    const idx = state.medications.findIndex(m => m.id === id);
    if (idx >= 0) state.medications[idx] = med; else state.medications.push(med);
    saveState(); closeModal(); render(); toast('Medicine saved');
  }

  function recordDose(key, status='given', details={}) {
    const dose = findDoseByKey(key); if (!dose) return;
    const now = new Date();
    const typedTime = String(details.actualTime || '').trim();
    const actualTime = typedTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(typedTime) ? formatTime(typedTime) : new Intl.DateTimeFormat([], { hour:'numeric', minute:'2-digit' }).format(now);
    const existing = state.logs.findIndex(l => l.doseKey === key);
    const log = {
      id: existing >= 0 ? state.logs[existing].id : uid('log'), doseKey:key, medId:dose.med.id, petId:dose.med.petId, dateKey:dose.dateKey,
      scheduledTime:dose.time, actualTime: status === 'given' ? actualTime : '', status, caregiverId:state.settings.activeCaregiverId, note:String(details.note || '').trim()
    };
    if (existing >= 0) state.logs[existing] = log; else state.logs.push(log);
    if (status === 'given' && typeof dose.med.refillQuantity === 'number') dose.med.refillQuantity = Math.max(0, dose.med.refillQuantity - 1);
    saveState(); closeModal(); render(); toast(status === 'given' ? 'Dose recorded as given' : `Dose marked ${status}`);
  }

  function logPrn(id) {
    const med = medById(id); if (!med) return;
    const now = new Date();
    const raw = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const key = doseKey(med.id, todayKey(now), `PRN-${raw}-${Date.now()}`);
    const log = { id:uid('log'), doseKey:key, medId:med.id, petId:med.petId, dateKey:todayKey(now), scheduledTime:raw, actualTime:formatTime(raw), status:'given', caregiverId:state.settings.activeCaregiverId, note:'As-needed dose' };
    state.logs.push(log);
    if (typeof med.refillQuantity === 'number') med.refillQuantity = Math.max(0, med.refillQuantity - 1);
    saveState(); render(); toast('Dose recorded');
  }

  function showDoseOptions(key) {
    const dose = findDoseByKey(key); if (!dose) return;
    const status = doseStatus(dose); const log = logForDose(dose);
    openModal({ eyebrow:`${dose.pet?.name || ''} · ${formatTime(dose.time)}`, title:dose.med.nickname || dose.med.name, body:`
      <section class="card flat"><p><strong>Give:</strong> ${esc(dose.med.doseAmount || '')}</p>${dose.med.instructions?`<p><strong>How:</strong> ${esc(dose.med.instructions)}</p>`:''}<p><strong>Right now:</strong> ${esc(statusLabel(status))}</p>${log?`<p><strong>Recorded at:</strong> ${esc(log.actualTime || '')}</p>`:''}</section>
      <details class="optional"><summary>Add a time or note</summary><div class="optional-body form-grid"><label>What time did you give it?<input type="time" name="actualTime"></label><label>Note <span class="hint">Optional</span><textarea name="note" placeholder="Anything you want to remember">${esc(log?.note || '')}</textarea></label></div></details>
      <div class="notice" style="margin-top:12px">Missed a dose? Follow your veterinarian’s instructions. Don’t double the next dose unless they told you to.</div>
      <div class="actions"><button class="btn" type="button" data-dose-status="given" data-dose="${esc(key)}">Mark as given</button><button class="btn secondary" type="button" data-dose-status="skipped" data-dose="${esc(key)}">I’m skipping this dose</button></div>` });
    bindModalControls();
  }

  function showRefill(id) {
    const med = medById(id); if (!med) return;
    openModal({ eyebrow:'Refill tracking', title:med.nickname || med.name, body:`
      <div class="form-grid"><label>Quantity remaining<input name="qty" type="number" min="0" value="${esc(med.refillQuantity ?? '')}"></label><label>Remind when quantity reaches<input name="threshold" type="number" min="0" value="${esc(med.refillThreshold ?? 5)}"></label></div>
      <div class="actions"><button class="btn" type="button" data-save-refill="${esc(id)}">Save refill</button></div>` });
    bindModalControls();
  }

  function saveRefill(id) {
    const med = medById(id); const data = formDataObject(); if (!med) return;
    med.refillQuantity = Math.max(0, Number(data.qty)||0); med.refillThreshold = Math.max(0, Number(data.threshold)||0);
    saveState(); closeModal(); render(); toast('Refill updated');
  }

  function showCaregiverForm() {
    openModal({ eyebrow:'Shared care', title:'Add another person', body:`<p class="small muted">Their name will appear beside doses they record on this device.</p><div class="form-grid"><label>Name<input name="caregiverName" required placeholder="e.g. Sam"></label></div><div class="actions"><button class="btn full" type="button" data-save-caregiver>Save person</button></div>` });
    bindModalControls();
  }

  function saveCaregiver() {
    const data = formDataObject(); if (!data.caregiverName?.trim()) return toast('Name is required');
    const c = { id:uid('caregiver'), name:data.caregiverName.trim(), role:'Caregiver' };
    state.caregivers.push(c); state.settings.activeCaregiverId = c.id; saveState(); closeModal(); render(); toast('Person added');
  }

  function showPetSummary(id) {
    const pet = petById(id); if (!pet) return;
    const meds = state.medications.filter(m => m.petId === id && m.active);
    openModal({ eyebrow:'Veterinary summary', title:pet.name, body:`
      <section class="card flat"><p><strong>${esc(pet.species || 'Pet')}</strong>${pet.breed ? ` · ${esc(pet.breed)}`:''}${pet.weight ? ` · ${esc(pet.weight)} ${esc(pet.weightUnit||'kg')}`:''}</p>${pet.allergies?`<p><strong>Allergies:</strong> ${esc(pet.allergies)}</p>`:''}${pet.conditions?`<p><strong>Conditions:</strong> ${esc(pet.conditions)}</p>`:''}${pet.vet?`<p><strong>Vet:</strong> ${esc(pet.vet)}</p>`:''}</section>
      <div class="section-title"><h2>Current medications</h2></div>
      ${meds.length ? meds.map(m => `<section class="card flat" style="margin-bottom:10px"><strong>${esc(m.name)}</strong><p class="small muted">${esc(m.doseAmount)} · ${(m.times||[]).map(formatTime).join(', ') || 'As needed'}</p><p class="small">${esc(m.instructions||'')}</p></section>`).join('') : '<p class="muted">No active medications.</p>'}` });
  }

  function deletePet(id) {
    state.pets = state.pets.filter(p => p.id !== id);
    state.medications = state.medications.filter(m => m.petId !== id);
    state.logs = state.logs.filter(l => l.petId !== id);
    saveState(); closeModal(); render(); toast('Pet and related medications deleted');
  }

  function deleteMed(id) {
    state.medications = state.medications.filter(m => m.id !== id);
    state.logs = state.logs.filter(l => l.medId !== id);
    saveState(); closeModal(); render(); toast('Medication deleted');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state,null,2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`petmed-backup-${todayKey()}.json`; a.click(); URL.revokeObjectURL(url);
  }

  function importData() {
    const input = document.createElement('input'); input.type='file'; input.accept='application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader(); reader.onload = () => {
        try { const parsed = JSON.parse(reader.result); state = { ...structuredClone(DEFAULT_STATE), ...parsed, reminderMarkers:{...(parsed.reminderMarkers||{})}, settings:{...DEFAULT_STATE.settings,...(parsed.settings||{})} }; saveState(); render(); toast('Backup imported'); }
        catch { toast('Could not import that file'); }
      }; reader.readAsText(file);
    }); input.click();
  }

  function resetData() {
    if (!confirm('Delete all PetMed data stored on this device?')) return;
    state = structuredClone(DEFAULT_STATE); saveState(); render(); toast('All data reset');
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return toast('Notifications are not supported here');
    const result = await Notification.requestPermission();
    toast(result === 'granted' ? 'Phone notifications are on' : result === 'denied' ? 'Notifications are blocked in your browser' : 'Notifications were not turned on'); render();
  }

  function checkReminders() {
    if (!state.settings.remindersEnabled) return;
    const now = new Date(); const key = todayKey(now); const current = now.getHours()*60 + now.getMinutes();
    for (const dose of scheduledDosesForDate(key)) {
      if (logForDose(dose)) continue;
      const due = minutesFromTime(dose.time); const lead = Number(state.settings.reminderLeadMinutes||0);
      if (current >= due-lead && current <= due+1) {
        const marker = `reminder:${dose.key}:${todayKey()}`;
        if (state.reminderMarkers?.[marker]) continue;
        state.reminderMarkers = state.reminderMarkers || {}; state.reminderMarkers[marker] = Date.now(); saveState();
        const body = `${dose.pet?.name || 'Your pet'} · ${dose.med.doseAmount || ''}${dose.med.instructions ? ` · ${dose.med.instructions}`:''}`;
        if ('Notification' in window && Notification.permission === 'granted') new Notification(`${dose.med.nickname || dose.med.name} due ${formatTime(dose.time)}`, { body, icon:'icons/icon-192.png' });
        toast(`${dose.pet?.name || 'Pet'}: ${dose.med.nickname || dose.med.name} is due ${formatTime(dose.time)}`);
      }
    }
    for (const med of state.medications) {
      if (typeof med.refillQuantity === 'number' && med.refillQuantity <= Number(med.refillThreshold||0)) {
        const marker = `refill:${med.id}:${med.refillQuantity}`;
        if (!state.reminderMarkers?.[marker]) { state.reminderMarkers = state.reminderMarkers || {}; state.reminderMarkers[marker] = Date.now(); saveState(); toast(`Refill reminder: ${med.nickname || med.name} is low`); }
      }
    }
  }

  function setupReminderLoop() {
    clearInterval(notificationTimer);
    if (state.settings.remindersEnabled) {
      checkReminders();
      notificationTimer = setInterval(checkReminders, 30000);
    }
  }

  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => setRoute(btn.dataset.route)));
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installPrompt = e; installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return toast('Use your browser menu to install this app');
    installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installBtn.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  setupReminderLoop();
  render();
})();
