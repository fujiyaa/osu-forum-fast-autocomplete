// ==UserScript==
// @name         osu!forum FastAutocomplete
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Подсвечивает последние 1–3 слова, ищет их на osu! форуме и автозаполняет по Enter. Работает на SPA-переходах.
// @match        https://osu.ppy.sh/community/forums/topics/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const FORUM_ID = 35;

    function setupTextarea(textarea) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        textarea.parentNode.insertBefore(wrapper, textarea);
        wrapper.appendChild(textarea);

        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            pointerEvents: 'none',
            color: 'inherit',
            font: 'inherit',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            width: '100%',
            height: '100%',
            padding: getComputedStyle(textarea).padding,
        });
        overlay.style.fontSize = getComputedStyle(textarea).fontSize;
        overlay.style.lineHeight = getComputedStyle(textarea).lineHeight;
        overlay.style.fontFamily = getComputedStyle(textarea).fontFamily;
        overlay.style.fontWeight = getComputedStyle(textarea).fontWeight;
        wrapper.appendChild(overlay);

        textarea.style.background = 'transparent';
        textarea.style.color = 'transparent';
        textarea.style.caretColor = '#fff';

        const hintContainer = document.createElement('div');
        hintContainer.style.display = 'flex';
        hintContainer.style.alignItems = 'center';
        hintContainer.style.gap = '6px';
        hintContainer.style.marginBottom = '2px';
        wrapper.appendChild(hintContainer);

        const hintText = document.createElement('span');
        hintText.textContent = 'Нажмите сюда или Enter для автозаполнения';
        hintText.style.fontSize = '0.8em';
        hintText.style.color = '#777';
        hintText.style.fontStyle = 'italic';
        hintContainer.appendChild(hintText);

        const hintButton = document.createElement('button');
        hintButton.textContent = '＊';

        Object.assign(hintButton.style, {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            border: 'none',
            background: '#ff66aa',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 'bold',
            padding: '0',
            fontSize: '14px', // подгон под размер
        });
        hintButton.type = 'button';

        hintContainer.appendChild(hintButton);

        hintContainer.style.display = 'none';

        const hintBox = document.createElement('div');
        Object.assign(hintBox.style, {
            marginTop: '6px',
            fontSize: '0.9em',
            color: '#ccc',
            fontStyle: 'italic',
        });
        wrapper.appendChild(hintBox);

        let searchTimeout;
        let currentHint = '';

        function showHint() {
            hintContainer.style.display = 'flex';
        }

        function hideHint() {
            hintContainer.style.display = 'none';
        }

        hintButton.addEventListener('click', () => {
            if (currentHint) {
                insertHint(textarea, currentHint);
                currentHint = '';
                hintBox.textContent = '';
                hideHint();
            }
        });

        textarea.addEventListener('input', () => {
            const text = textarea.value.trim();
            const words = text.split(/\s+/);

            if (!words.length) {
                overlay.innerHTML = '';
                hintBox.textContent = '';
                currentHint = '';
                hideHint();
                return;
            }

            const maxWords = Math.min(3, words.length);
            const searchWords = words.slice(-maxWords);

            overlay.innerHTML = words.map(word =>
                searchWords.some(sw => sw.toLowerCase() === word.toLowerCase())
                    ? `<span style="color:#ff66aa;">${word}</span>`
                    : word
            ).join(' ');

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                let found = false;
                for (let n = maxWords; n >= 1; n--) {
                    const query = words.slice(-n).join(' ');
                    const result = await searchLastWord(query, hintBox);
                    if (result) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    hintBox.textContent = 'нет результатов...';
                    currentHint = '';
                    hideHint();
                }
            }, 800);
        });

        textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && currentHint) {
                e.preventDefault();
                insertHint(textarea, currentHint);
                currentHint = '';
                hintBox.textContent = '';
                hideHint();
            }
        });

        async function searchLastWord(query, container) {
            const url = `https://osu.ppy.sh/home/search?mode=forum_post&query=${encodeURIComponent(query)}&username=&forum_id=${FORUM_ID}&forum_children=on`;
            try {
                const res = await fetch(url, { credentials: 'include' });
                const text = await res.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const results = Array.from(doc.querySelectorAll('.search-forum-post__content'));
                if (!results.length) return false;

                const randomResult = results[Math.floor(Math.random() * results.length)];
                const excerpt = randomResult.querySelector('.search-forum-post__text--excerpt')?.innerText || '';
                const cleaned = excerpt.replace(/\s+/g, ' ').trim();

                container.textContent = cleaned;
                currentHint = cleaned;
                showHint();
                return true;
            } catch (err) {
                console.error('Ошибка при поиске:', err);
                container.textContent = 'ошибка загрузки';
                currentHint = '';
                hideHint();
                return false;
            }
        }

        function insertHint(textarea, hintText) {
            const text = textarea.value.trim();
            const words = text.split(/\s+/);
            const lastWord = words.pop() || '';
            const rest = words.join(' ');

            const index = hintText.toLowerCase().indexOf(lastWord.toLowerCase());
            let addition = '';

            if (index !== -1) {
                const before = hintText.slice(0, index).trim();
                const after = hintText.slice(index + lastWord.length).trim();
                if (after.length === 0) addition = hintText;
                else addition = before + ' ' + lastWord + ' ' + after;
            } else {
                addition = hintText;
            }

            textarea.value = (rest + (rest ? ' ' : '') + addition).replace(/\s+/g, ' ').trim() + ' ';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function waitForTextareaAndInit() {
        const check = () => {
            const textarea = document.querySelector('textarea.bbcode-editor__body.js-forum-post-input');
            if (textarea && !textarea.dataset.fastAutocompleteInitialized) {
                textarea.dataset.fastAutocompleteInitialized = 'true';
                setupTextarea(textarea);
                return true;
            }
            return false;
        };

        const interval = setInterval(() => {
            if (check()) clearInterval(interval);
        }, 200);

        check();
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            waitForTextareaAndInit();
        }
    }).observe(document, { subtree: true, childList: true });

    waitForTextareaAndInit();

})();
