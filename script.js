/* ═══════════════════════════════════════════════════════
   CV BUILDER — Lógica principal (editor + IA)
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const STORAGE_KEY = 'cv_builder_data_v1';

  // La clave se obtiene de config.js (window.GEMINI_API_KEY) o del almacenamiento local (localStorage).
  function getGeminiApiKey() {
    if (typeof window !== 'undefined' && window.GEMINI_API_KEY && window.GEMINI_API_KEY !== 'TU_GEMINI_API_KEY_AQUI') {
      return window.GEMINI_API_KEY;
    }
    return localStorage.getItem('GEMINI_API_KEY') || '';
  }

  const GEMINI_MODEL   = 'gemini-3.8-flash';
  const GEMINI_ENDPOINT =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  /* Schema JSON para forzar la salida de Gemini al shape de nuestro state */
  const CV_SCHEMA = {
    type: 'object',
    properties: {
      personal: {
        type: 'object',
        properties: {
          name:     { type: 'string' },
          role:     { type: 'string' },
          email:    { type: 'string' },
          phone:    { type: 'string' },
          location: { type: 'string' },
          summary:  { type: 'string' }
        }
      },
      experience: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role:        { type: 'string' },
            company:     { type: 'string' },
            startDate:   { type: 'string' },
            endDate:     { type: 'string' },
            description: { type: 'string' }
          }
        }
      },
      education: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            degree:      { type: 'string' },
            institution: { type: 'string' },
            startDate:   { type: 'string' },
            endDate:     { type: 'string' }
          }
        }
      },
      skills:    { type: 'array', items: { type: 'string' } },
      languages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:  { type: 'string' },
            level: { type: 'string' }
          }
        }
      }
    }
  };

  /* ─────────────── ESTADO INICIAL ─────────────── */
  const EMPTY_STATE = {
    personal: {
      name: '', role: '', email: '', phone: '', location: '', summary: ''
    },
    experience: [],
    education:  [],
    skills:     [],
    languages:  []
  };

  const uid = () => Math.random().toString(36).slice(2, 9);

  /* Plantillas de items repetibles (shape inicial) */
  const ITEM_FACTORY = {
    experience: () => ({
      id: uid(), role: '', company: '', startDate: '', endDate: '', description: ''
    }),
    education: () => ({
      id: uid(), degree: '', institution: '', startDate: '', endDate: ''
    }),
    languages: () => ({
      id: uid(), name: '', level: ''
    })
  };

  /* Config de campos por tipo de item repetible */
  const ITEM_FIELDS = {
    experience: [
      { key: 'role',        label: 'Puesto',          type: 'text' },
      { key: 'company',     label: 'Empresa',         type: 'text' },
      { key: 'startDate',   label: 'Desde',           type: 'text', placeholder: 'Ene 2022' },
      { key: 'endDate',     label: 'Hasta',           type: 'text', placeholder: 'Actualidad' },
      { key: 'description', label: 'Descripción',     type: 'textarea' }
    ],
    education: [
      { key: 'degree',      label: 'Título',          type: 'text' },
      { key: 'institution', label: 'Institución',     type: 'text' },
      { key: 'startDate',   label: 'Desde',           type: 'text', placeholder: '2018' },
      { key: 'endDate',     label: 'Hasta',           type: 'text', placeholder: '2022' }
    ],
    languages: [
      { key: 'name',  label: 'Idioma',  type: 'text' },
      { key: 'level', label: 'Nivel',   type: 'text', placeholder: 'B2 / Avanzado' }
    ]
  };

  let state = loadState();

  /* ─────────────── PERSISTENCIA ─────────────── */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(EMPTY_STATE);
      const parsed = JSON.parse(raw);
      return {
        personal:   { ...EMPTY_STATE.personal,   ...(parsed.personal   || {}) },
        experience: Array.isArray(parsed.experience) ? parsed.experience : [],
        education:  Array.isArray(parsed.education)  ? parsed.education  : [],
        skills:     Array.isArray(parsed.skills)     ? parsed.skills     : [],
        languages:  Array.isArray(parsed.languages)  ? parsed.languages  : []
      };
    } catch (e) {
      console.warn('No se pudo leer localStorage, arranco vacío.', e);
      return structuredClone(EMPTY_STATE);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage.', e);
    }
  }

  /* ─────────────── HELPERS DOM ─────────────── */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class')      node.className = v;
      else if (k === 'text')  node.textContent = v;
      else if (k === 'html')  node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v != null) {
        node.setAttribute(k, v);
      }
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ─────────────── NAVEGACIÓN ─────────────── */
  function initNav() {
    $$('.section-list__item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.section));
    });
  }

  function switchView(section) {
    $$('.section-list__item').forEach(b => b.classList.toggle('is-active', b.dataset.section === section));
    $$('.form-view').forEach(v => v.classList.toggle('is-active', v.dataset.view === section));
  }

  /* ─────────────── BIND: DATOS PERSONALES ─────────────── */
  function initPersonalBind() {
    $$('[data-bind]').forEach(input => {
      const path = input.dataset.bind;
      const [section, key] = path.split('.');

      input.value = state[section]?.[key] ?? '';

      input.addEventListener('input', () => {
        if (!state[section]) state[section] = {};
        state[section][key] = input.value;
        onStateChange();
      });
    });
  }

  function syncPersonalInputs() {
    $$('[data-bind]').forEach(input => {
      const [section, key] = input.dataset.bind.split('.');
      input.value = state[section]?.[key] ?? '';
    });
  }

  /* ─────────────── REPEATABLES (exp/edu/lang) ─────────────── */
  function renderRepeatable(type) {
    const container = $(`#${type}-list`);
    if (!container) return;
    container.innerHTML = '';

    state[type].forEach((item, index) => {
      container.appendChild(buildRepeatableItem(type, item, index));
    });

    if (state[type].length === 0) {
      container.appendChild(
        el('p', { class: 'field', text: 'Aún no agregaste elementos.' })
      );
    }
  }

  function buildRepeatableItem(type, item, index) {
    const fields = ITEM_FIELDS[type];

    const header = el('div', { class: 'repeatable-item__header' }, [
      el('span', { class: 'repeatable-item__title', text: `#${index + 1}` }),
      el('button', {
        class: 'btn--icon',
        type: 'button',
        title: 'Eliminar',
        text: '✕',
        onClick: () => removeItem(type, item.id)
      })
    ]);

    const body = fields.map(f => {
      const inputId = `${type}-${item.id}-${f.key}`;
      const control = f.type === 'textarea'
        ? el('textarea', {
            id: inputId,
            rows: 3,
            placeholder: f.placeholder || '',
            oninput: (e) => updateItem(type, item.id, f.key, e.target.value)
          })
        : el('input', {
            id: inputId,
            type: 'text',
            placeholder: f.placeholder || '',
            oninput: (e) => updateItem(type, item.id, f.key, e.target.value)
          });
      control.value = item[f.key] ?? '';

      return el('div', { class: 'field' }, [
        el('label', { for: inputId, text: f.label }),
        control
      ]);
    });

    return el('div', { class: 'repeatable-item' }, [header, ...body]);
  }

  function addItem(type) {
    state[type].push(ITEM_FACTORY[type]());
    saveState();
    renderRepeatable(type);
    renderPreview();
  }

  function removeItem(type, id) {
    state[type] = state[type].filter(i => i.id !== id);
    saveState();
    renderRepeatable(type);
    renderPreview();
  }

  function updateItem(type, id, key, value) {
    const item = state[type].find(i => i.id === id);
    if (!item) return;
    item[key] = value;
    onStateChange();
  }

  function initRepeatableButtons() {
    $$('[data-action="add"]').forEach(btn => {
      btn.addEventListener('click', () => addItem(btn.dataset.target));
    });
  }

  /* ─────────────── SKILLS (tags) ─────────────── */
  function renderSkills() {
    const list = $('#skills-list');
    if (!list) return;
    list.innerHTML = '';
    state.skills.forEach((skill, i) => {
      const tag = el('li', { class: 'tag' }, [
        el('span', { text: skill }),
        el('button', {
          class: 'tag__remove',
          type: 'button',
          title: 'Eliminar',
          text: '✕',
          onClick: () => removeSkill(i)
        })
      ]);
      list.appendChild(tag);
    });
  }

  function addSkill(value) {
    const v = value.trim();
    if (!v) return;
    if (state.skills.includes(v)) return;
    state.skills.push(v);
    saveState();
    renderSkills();
    renderPreview();
  }

  function removeSkill(index) {
    state.skills.splice(index, 1);
    saveState();
    renderSkills();
    renderPreview();
  }

  function initSkills() {
    const input = $('#skills-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSkill(input.value);
        input.value = '';
      }
    });
  }

  /* ─────────────── PREVIEW ─────────────── */
  function renderPreview() {
    const root = $('#cv-preview');
    if (!root) return;
    root.innerHTML = '';

    const p = state.personal;

    if (p.name)     root.appendChild(el('h3', { class: 'cv-preview__name', text: p.name }));
    if (p.role)     root.appendChild(el('p',  { class: 'cv-preview__role', text: p.role }));

    const contactParts = [p.email, p.phone, p.location].filter(Boolean);
    if (contactParts.length) {
      root.appendChild(el('div', { class: 'cv-preview__contact' },
        contactParts.map(c => el('span', { text: c }))
      ));
    }

    if (p.summary) {
      root.appendChild(buildPreviewSection('Resumen', [
        el('p', { class: 'cv-preview__entry-desc', text: p.summary })
      ]));
    }

    if (state.experience.length) {
      root.appendChild(buildPreviewSection('Experiencia', state.experience.map(exp => {
        const title = [exp.role, exp.company].filter(Boolean).join(' — ');
        const meta  = [exp.startDate, exp.endDate].filter(Boolean).join(' · ');
        return el('div', { class: 'cv-preview__entry' }, [
          title && el('div', { class: 'cv-preview__entry-title', text: title }),
          meta  && el('div', { class: 'cv-preview__entry-meta',  text: meta  }),
          exp.description && el('p', { class: 'cv-preview__entry-desc', text: exp.description })
        ].filter(Boolean));
      })));
    }

    if (state.education.length) {
      root.appendChild(buildPreviewSection('Educación', state.education.map(edu => {
        const title = [edu.degree, edu.institution].filter(Boolean).join(' — ');
        const meta  = [edu.startDate, edu.endDate].filter(Boolean).join(' · ');
        return el('div', { class: 'cv-preview__entry' }, [
          title && el('div', { class: 'cv-preview__entry-title', text: title }),
          meta  && el('div', { class: 'cv-preview__entry-meta',  text: meta  })
        ].filter(Boolean));
      })));
    }

    if (state.skills.length) {
      root.appendChild(buildPreviewSection('Habilidades', [
        el('p', { class: 'cv-preview__entry-desc', text: state.skills.join(' · ') })
      ]));
    }

    if (state.languages.length) {
      root.appendChild(buildPreviewSection('Idiomas', state.languages.map(lang => {
        const text = [lang.name, lang.level].filter(Boolean).join(' — ');
        return el('div', { class: 'cv-preview__entry' }, [
          el('div', { class: 'cv-preview__entry-title', text })
        ]);
      })));
    }

    if (!root.children.length) {
      root.appendChild(el('p', { class: 'cv-preview__entry-meta', text: 'Empezá a completar tus datos para ver el CV acá.' }));
    }
  }

  function buildPreviewSection(title, children) {
    return el('section', { class: 'cv-preview__section' }, [
      el('h4', { class: 'cv-preview__section-title', text: title }),
      ...children
    ]);
  }

  /* ─────────────── IA: GEMINI ─────────────── */
  async function generateWithAI(userPrompt) {
    let apiKey = getGeminiApiKey();
    if (!apiKey || apiKey === 'PEGÁ_ACÁ_TU_KEY' || apiKey === 'TU_GEMINI_API_KEY_AQUI') {
      const promptedKey = window.prompt('Por favor ingresá tu API Key de Google Gemini para usar la función de IA:\n(Se guardará localmente en tu navegador)');
      if (promptedKey && promptedKey.trim()) {
        apiKey = promptedKey.trim();
        localStorage.setItem('GEMINI_API_KEY', apiKey);
      } else {
        throw new Error('Falta configurar la API Key de Gemini (puedes crear config.js o ingresarla en el navegador).');
      }
    }

    const systemInstruction = `
Sos un asistente experto en redacción de CVs profesionales.
A partir de la descripción del usuario, generá los datos del CV.
Devolvé SOLO el JSON, sin texto extra.
Si el usuario no menciona algún dato, dejalo como string vacío o array vacío.
No inventes datos de contacto (email, teléfono) si el usuario no los dio.
Para experience, education y languages, generá arrays de objetos.
Para skills, generá un array de strings cortos (tecnologías, herramientas, soft skills).
El resumen profesional debe ser conciso (2-4 líneas) y orientado al rol.
`.trim();

    const body = {
      contents: [{
        parts: [{ text: `${systemInstruction}\n\nDescripción del usuario:\n${userPrompt}` }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: CV_SCHEMA,
        temperature: 0.7
      }
    };

    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    // Si Gemini devuelve 503 (sobrecarga temporal), reintenta hasta 3 veces
if (!res.ok && res.status === 503) {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    await new Promise(r => setTimeout(r, 2000 * (retries + 1))); // espera 2s, 4s, 6s
    console.log(`Reintentando (${retries + 1}/${maxRetries})...`);
    
    const retry = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });
    
    if (retry.ok) {
      const data = await retry.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return JSON.parse(text);
    }
    
    retries++;
  }
  
  throw new Error('Gemini está sobrecargado. Probá de nuevo en unos minutos.');
}

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Respuesta vacía de Gemini');

    return JSON.parse(text);
  }

  function normalizeAIResult(raw) {
    const safeStr = (v) => (typeof v === 'string' ? v : '');
    const safeArr = (v) => (Array.isArray(v) ? v : []);

    return {
      personal: {
        name:     safeStr(raw?.personal?.name),
        role:     safeStr(raw?.personal?.role),
        email:    safeStr(raw?.personal?.email),
        phone:    safeStr(raw?.personal?.phone),
        location: safeStr(raw?.personal?.location),
        summary:  safeStr(raw?.personal?.summary)
      },
      experience: safeArr(raw?.experience).map(e => ({
        id: uid(),
        role:        safeStr(e?.role),
        company:     safeStr(e?.company),
        startDate:   safeStr(e?.startDate),
        endDate:     safeStr(e?.endDate),
        description: safeStr(e?.description)
      })),
      education: safeArr(raw?.education).map(e => ({
        id: uid(),
        degree:      safeStr(e?.degree),
        institution: safeStr(e?.institution),
        startDate:   safeStr(e?.startDate),
        endDate:     safeStr(e?.endDate)
      })),
      skills: safeArr(raw?.skills).map(s => String(s).trim()).filter(Boolean),
      languages: safeArr(raw?.languages).map(l => ({
        id: uid(),
        name:  safeStr(l?.name),
        level: safeStr(l?.level)
      }))
    };
  }

  /* ─────────────── ORQUESTACIÓN ─────────────── */
  function onStateChange() {
    saveState();
    renderPreview();
  }

  function initAI() {
    const bar     = $('#ai-bar');
    const toggle  = $('#btn-ai-toggle');
    const prompt  = $('#ai-prompt');
    const btnGen  = $('#ai-generate');
    const btnClr  = $('#ai-clear');
    const status  = $('#ai-status');

    if (!bar || !toggle || !prompt || !btnGen || !status) return;

    bar.hidden = true;

    toggle.addEventListener('click', () => {
      bar.hidden = !bar.hidden;
      if (!bar.hidden) prompt.focus();
    });

    btnClr?.addEventListener('click', () => {
      bar.hidden = true;
      prompt.value = '';
      status.hidden = true;
      status.textContent = '';
    });

    const setStatus = (msg, kind = '') => {
      status.hidden = !msg;
      status.textContent = msg;
      status.className = 'ai-bar__status' + (kind ? ` is-${kind}` : '');
    };

    btnGen.addEventListener('click', async () => {
      const value = prompt.value.trim();
      if (!value) {
        setStatus('Escribí una descripción primero.', 'error');
        return;
      }

      btnGen.disabled = true;
      prompt.disabled = true;
      setStatus('Generando CV con IA… esto puede tardar unos segundos.', 'loading');

      try {
        const raw = await generateWithAI(value);
        state = normalizeAIResult(raw);

        syncPersonalInputs();
        ['experience', 'education', 'languages'].forEach(renderRepeatable);
        renderSkills();
        renderPreview();
        saveState();

        setStatus('✅ CV generado. Revisá y ajustá lo que quieras.');
        switchView('personal');
      } catch (err) {
        console.error(err);
        setStatus(`❌ ${err.message}`, 'error');
      } finally {
        btnGen.disabled = false;
        prompt.disabled = false;
      }
    });
  }

  function initHeaderActions() {
    // Reset
    $('#btn-reset')?.addEventListener('click', () => {
      const ok = confirm('¿Seguro que querés reiniciar el CV? Se pierde todo lo cargado.');
      if (!ok) return;
      state = structuredClone(EMPTY_STATE);
      localStorage.removeItem(STORAGE_KEY);
      syncPersonalInputs();
      ['experience', 'education', 'languages'].forEach(renderRepeatable);
      renderSkills();
      renderPreview();
      switchView('personal');
    });

    // Export JSON
    $('#btn-export')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const name = (state.personal.name || 'cv').replace(/\s+/g, '_').toLowerCase();
      a.href = url;
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /* ─────────────── BOOT ─────────────── */
  function init() {
    initNav();
    initPersonalBind();
    initRepeatableButtons();
    initSkills();
    initHeaderActions();
    initAI();

    ['experience', 'education', 'languages'].forEach(renderRepeatable);
    renderSkills();
    renderPreview();
  }

  document.addEventListener('DOMContentLoaded', init);
})();