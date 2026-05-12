(function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    let editor = null;
    let currentId = null;
    let dirty = false;

    // ── CodeMirror language mode map ─────────────────────────
    const MODES = {
        javascript: { name: 'javascript' },
        typescript: { name: 'javascript', typescript: true },
        json:       { name: 'javascript', json: true },
        python:     'python',
        csharp:     'text/x-csharp',
        java:       'text/x-java',
        cpp:        'text/x-c++src',
        c:          'text/x-csrc',
        go:         'go',
        rust:       'rust',
        sql:        'text/x-sql',
        html:       'htmlmixed',
        css:        'css',
        xml:        'xml',
        markdown:   'markdown',
        shell:      'shell',
        yaml:       'yaml',
        text:       null
    };

    const LANG_LABELS = {
        javascript: 'JS', typescript: 'TS', json: 'JSON', python: 'PY',
        csharp: 'C#', java: 'Java', cpp: 'C++', c: 'C', go: 'Go',
        rust: 'RS', sql: 'SQL', html: 'HTML', css: 'CSS', xml: 'XML',
        markdown: 'MD', shell: 'SH', yaml: 'YML', text: 'TXT'
    };

    // ── Editor init ──────────────────────────────────────────
    function initEditor() {
        editor = CodeMirror(document.getElementById('editorHost'), {
            theme: 'dracula',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            styleActiveLine: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: false,
            extraKeys: {
                'Ctrl-S':    () => saveNote(),
                'Cmd-S':     () => saveNote(),
                'Ctrl-/':    'toggleComment',
                'Cmd-/':     'toggleComment',
                'Alt-Z':     () => toggleWrap(),
                'Ctrl-G':    'jumpToLine',
                'Tab': cm => {
                    if (cm.somethingSelected()) cm.indentSelection('add');
                    else cm.execCommand('insertSoftTab');
                },
                'Shift-Tab': cm => cm.indentSelection('subtract')
            }
        });

        // Resize editor to fill host
        const ro = new ResizeObserver(() => {
            const h = document.getElementById('editorHost').clientHeight;
            editor.setSize('100%', h);
        });
        ro.observe(document.getElementById('editorHost'));

        editor.on('change', () => { setDirty(true); updateStatus(); });
        editor.on('cursorActivity', updateStatus);

        // Load initial note from server-rendered data
        const init = window.__dn;
        if (init && init.id) {
            currentId = init.id;
            editor.setValue(init.content || '');
            setMode(init.language || 'text');
        }
        setDirty(false);
        updateStatus();
    }

    // ── Load note via AJAX ───────────────────────────────────
    async function loadNote(id) {
        try {
            const res = await fetch(`/Notes/Get/${id}`);
            if (!res.ok) return;
            const note = await res.json();

            currentId = note.id;
            $('noteTitle').value   = note.title;
            $('noteTags').value    = note.tags;
            $('noteLanguage').value = note.language;

            const pinBtn = $('pinBtn');
            pinBtn.classList.toggle('active', note.isPinned);
            pinBtn.title = note.isPinned ? 'Unpin' : 'Pin note';

            editor.setValue(note.content || '');
            setMode(note.language);
            setDirty(false);
            updateStatus();
            highlightSidebar(id);
            history.pushState({ id }, '', `?id=${id}`);
            editor.focus();
        } catch (e) {
            toast('Load failed', true);
        }
    }

    // ── Save note ────────────────────────────────────────────
    async function saveNote() {
        const titleEl = $('noteTitle');
        const title = titleEl.value.trim() || 'Untitled';
        titleEl.value = title;

        const payload = {
            id:       currentId || 0,
            title,
            content:  editor.getValue(),
            language: $('noteLanguage').value,
            tags:     $('noteTags').value.trim(),
            isPinned: $('pinBtn').classList.contains('active')
        };

        try {
            const res = await fetch('/Notes/Save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) { toast('Save failed', true); return; }

            const isNew = !currentId || currentId !== data.id;
            currentId = data.id;

            if (isNew) {
                prependSidebarItem(data.id, payload);
                history.pushState({ id: data.id }, '', `?id=${data.id}`);
            } else {
                refreshSidebarItem(data.id, payload);
            }

            setDirty(false);
            toast('Saved ✓');
        } catch (e) {
            toast('Save failed', true);
        }
    }

    // ── New note ─────────────────────────────────────────────
    function newNote() {
        const doNew = () => {
            currentId = null;
            $('noteTitle').value    = '';
            $('noteTags').value     = '';
            $('noteLanguage').value = 'text';
            $('pinBtn').classList.remove('active');
            $('pinBtn').title = 'Pin note';
            editor.setValue('');
            setMode('text');
            setDirty(false);
            updateStatus();
            highlightSidebar(null);
            history.pushState({}, '', '/');
            $('noteTitle').focus();
        };
        if (dirty && currentId) saveNote().then(doNew);
        else doNew();
    }

    // ── Delete note ──────────────────────────────────────────
    async function deleteNote() {
        if (!currentId) return;
        if (!confirm('Delete this note? This cannot be undone.')) return;
        try {
            const res = await fetch('/Notes/Delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentId })
            });
            const data = await res.json();
            if (data.success) {
                document.querySelector(`.note-item[data-id="${currentId}"]`)?.remove();
                pruneEmptySections();
                newNote();
            }
        } catch (e) {
            toast('Delete failed', true);
        }
    }

    // ── Toggle pin ───────────────────────────────────────────
    async function togglePin() {
        if (!currentId) return;
        try {
            const res = await fetch('/Notes/TogglePin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentId })
            });
            const data = await res.json();
            if (!data.success) return;

            const pinBtn = $('pinBtn');
            pinBtn.classList.toggle('active', data.isPinned);
            pinBtn.title = data.isPinned ? 'Unpin' : 'Pin note';

            const item = document.querySelector(`.note-item[data-id="${currentId}"]`);
            if (!item) return;
            item.dataset.pinned = data.isPinned ? '1' : '0';

            if (data.isPinned) {
                // Add pin indicator
                if (!item.querySelector('.pin-dot')) {
                    item.querySelector('.item-row')
                        .insertAdjacentHTML('afterbegin', '<span class="pin-dot">⬡</span>');
                }
                // Move to pinned section
                let ps = $('pinnedSection');
                ps.style.display = '';
                ps.appendChild(item);
            } else {
                // Remove pin indicator
                item.querySelector('.pin-dot')?.remove();
                // Move to regular section
                $('allSection').insertAdjacentElement('afterbegin', item);
                // Re-insert after section title
                const title = $('allSection').querySelector('.section-title');
                if (title) title.after(item);
                pruneEmptySections();
            }
            item.classList.add('active');
        } catch (e) {
            toast('Pin failed', true);
        }
    }

    // ── Word wrap toggle ─────────────────────────────────────
    let wordWrap = false;
    function toggleWrap() {
        wordWrap = !wordWrap;
        editor.setOption('lineWrapping', wordWrap);
        $('wrapBtn').classList.toggle('active', wordWrap);
        $('wrapBtn').title = wordWrap ? 'Disable Word Wrap (Alt+Z)' : 'Enable Word Wrap (Alt+Z)';
    }

    // ── Mode / status helpers ────────────────────────────────
    function setMode(lang) {
        editor.setOption('mode', MODES[lang] ?? null);
        $('statusLang').textContent = LANG_LABELS[lang] || lang;
    }

    function updateStatus() {
        if (!editor) return;
        const cur  = editor.getCursor();
        const sel  = editor.getSelection();
        const text = editor.getValue();

        $('statusCursor').textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
        $('statusChars').textContent  = `${text.length} chars`;
        $('statusWords').textContent  = `${text.split(/\s+/).filter(w => w).length} words`;
        $('statusLang').textContent   = LANG_LABELS[$('noteLanguage').value] || $('noteLanguage').value;

        const selEl = $('statusSel');
        selEl.textContent = sel.length ? `   ${sel.length} selected` : '';
    }

    function setDirty(d) {
        dirty = d;
        const el = $('statusSaved');
        el.textContent = d ? '● Modified' : '✓ Saved';
        el.className   = d ? 'status-dirty' : 'status-ok';
    }

    // ── Sidebar helpers ──────────────────────────────────────
    function highlightSidebar(id) {
        document.querySelectorAll('.note-item').forEach(el => {
            el.classList.toggle('active', id !== null && +el.dataset.id === id);
        });
    }

    function prependSidebarItem(id, note) {
        const html = buildItemHtml(id, note);
        const allSection = $('allSection');
        const sectionTitle = allSection.querySelector('.section-title');
        if (sectionTitle) sectionTitle.insertAdjacentHTML('afterend', html);
        else allSection.insertAdjacentHTML('afterbegin', html);
        highlightSidebar(id);
    }

    function refreshSidebarItem(id, note) {
        const item = document.querySelector(`.note-item[data-id="${id}"]`);
        if (!item) return;
        const t = item.querySelector('.item-title');
        const p = item.querySelector('.item-preview');
        const b = item.querySelector('.lang-badge');
        if (t) t.textContent = note.title;
        if (p) p.textContent = notePreview(note.content);
        if (b) b.textContent = LANG_LABELS[note.language] || 'TXT';
        item.querySelector('.item-time').textContent = 'now';
    }

    function pruneEmptySections() {
        const ps = $('pinnedSection');
        if (ps && ps.querySelectorAll('.note-item').length === 0) {
            ps.style.display = 'none';
        }
    }

    function buildItemHtml(id, note) {
        const preview  = esc(notePreview(note.content));
        const lang     = esc(LANG_LABELS[note.language] || 'TXT');
        const title    = esc(note.title);
        const tags     = esc(note.tags);
        return `
        <div class="note-item active" data-id="${id}" data-tags="${tags}" data-pinned="0">
            <div class="item-row">
                <span class="item-title">${title}</span>
                <span class="item-time">now</span>
            </div>
            <div class="item-meta">
                <span class="lang-badge">${lang}</span>
                <span class="item-preview">${preview}</span>
            </div>
        </div>`;
    }

    function notePreview(content) {
        const line = (content || '').split('\n').find(l => l.trim()) || '';
        return line.length > 42 ? line.slice(0, 42) + '…' : line;
    }

    function esc(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Toast ────────────────────────────────────────────────
    function toast(msg, isErr = false) {
        const el = $('toast');
        el.textContent = msg;
        el.className   = 'toast show' + (isErr ? ' err' : '');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 1800);
    }

    // ── Sidebar resize drag ──────────────────────────────────
    (function initResize() {
        const grip    = $('resizeGrip');
        const sidebar = $('sidebar');
        let dragging  = false;

        grip.addEventListener('mousedown', e => {
            dragging = true;
            grip.classList.add('dragging');
            document.body.style.cursor    = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const w = Math.max(160, Math.min(480, e.clientX));
            sidebar.style.width    = w + 'px';
            sidebar.style.minWidth = w + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            grip.classList.remove('dragging');
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
        });
    })();

    // ── Search filter ────────────────────────────────────────
    $('searchInput').addEventListener('input', function () {
        const q = this.value.toLowerCase().trim();
        document.querySelectorAll('.note-item').forEach(item => {
            if (!q) { item.style.display = ''; return; }
            const title   = (item.querySelector('.item-title')?.textContent || '').toLowerCase();
            const preview = (item.querySelector('.item-preview')?.textContent || '').toLowerCase();
            const tags    = (item.dataset.tags || '').toLowerCase();
            item.style.display = (title.includes(q) || preview.includes(q) || tags.includes(q)) ? '' : 'none';
        });
    });

    // ── Global keyboard shortcuts ────────────────────────────
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            newNote();
        }
    });

    // ── Note list click delegation ───────────────────────────
    $('notesList').addEventListener('click', e => {
        const item = e.target.closest('.note-item');
        if (item) loadNote(+item.dataset.id);
    });

    // ── Wire up UI ───────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initEditor();

        $('btnNew').addEventListener('click', newNote);
        $('btnSave').addEventListener('click', saveNote);
        $('btnDelete').addEventListener('click', deleteNote);
        $('pinBtn').addEventListener('click', togglePin);
        $('wrapBtn').addEventListener('click', toggleWrap);

        $('noteLanguage').addEventListener('change', e => {
            setMode(e.target.value);
            if (currentId) setDirty(true);
        });

        // Enter in title → jump to editor
        $('noteTitle').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); editor?.focus(); }
        });

        // Auto-save when tab/window loses focus
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && dirty && currentId) saveNote();
        });

        // Highlight initially active item
        const active = document.querySelector('.note-item.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    });

    // ── Util ─────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }

})();
