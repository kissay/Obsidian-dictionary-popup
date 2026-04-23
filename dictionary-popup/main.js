var obsidian = require('obsidian');

class DictionaryPlugin extends obsidian.Plugin {
  async onload() {
    console.log('Loading Dictionary Popup Plugin');

    // add styles
    this.addStyle();

    // click time
    this.lastClickTime = 0;
    this.clickCount = 0;

    // click event
    this.registerDomEvent(document, 'mousedown', this.handleDoubleClick.bind(this));

    // add command
    this.addCommand({
      id: 'lookup-word',
      name: 'Lookup selected word',
      callback: () => {
        const selection = window.getSelection().toString().trim();
        if (selection) {
          this.showDictionaryPopup(selection);
        }
      }
    });
  }

  onunload() {
    console.log('Unloading Dictionary Popup Plugin');
    this.removeExistingPopup();
  }

  addStyle() {
    const css = `
        .dictionary-popup-modal {
            position: fixed;
            z-index: 10000;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            padding: 12px;
            min-width: 200px;
            max-width: 300px;
            font-family: var(--font-text);
        }

        .dictionary-popup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .dictionary-word {
            font-size: 1.2em;
            font-weight: bold;
            color: var(--text-accent);
            margin: 0;
        }

        .dictionary-close-btn {
            background: none;
            border: none;
            font-size: 1.2em;
            cursor: pointer;
            color: var(--text-muted);
            opacity: 0.6;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .dictionary-close-btn:hover {
            opacity: 1;
            color: var(--text-error);
        }

        .dictionary-loader {
            color: var(--text-muted);
            font-style: italic;
        }

        .dictionary-error {
            color: var(--text-error);
        }

        .dictionary-popup-content {
            line-height: 1.4;
        }

        .dictionary-pronunciation {
            color: var(--text-muted);
            font-style: italic;
            margin-bottom: 12px;
        }

        .dictionary-definition {
            margin-bottom: 8px;
        }

        .dictionary-definition strong {
            color: var(--text-accent);
        }

        .dictionary-source {
            margin-top: 12px;
            font-size: 0.9em;
            color: var(--text-faint);
        }

        .dictionary-source a {
            color: var(--text-accent);
            text-decoration: none;
        }

        .dictionary-source a:hover {
            text-decoration: underline;
        }
        `;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = css;
    document.head.appendChild(this.styleEl);
  }

  handleDoubleClick(event) {
    // Only double click
    if (event.button !== 0) return;

    const currentTime = new Date().getTime();
    const timeDiff = currentTime - this.lastClickTime;

    // click time <300ms
    if (timeDiff < 300) {
      this.clickCount++;
      if (this.clickCount >= 2) {
        this.handleWordLookup(event);
        this.clickCount = 0;
      }
    } else {
      this.clickCount = 1;
    }

    this.lastClickTime = currentTime;
  }

  async handleWordLookup(event) {
    // confirm target is text
    if (event.target.nodeType === Node.TEXT_NODE ||
      event.target.matches('.cm-line, .cm-content, .markdown-preview-view, .cm-hmd-embed, .markdown-preview-section')) {

      const selection = window.getSelection();
      if (selection.toString().trim() && selection.anchorOffset !== selection.focusOffset) {
        // select word
        const selectedWord = selection.toString().trim();
        if (this.isValidWord(selectedWord)) {
          event.preventDefault();
          event.stopPropagation();
          this.showDictionaryPopup(selectedWord);
        }
      } else {
        // get word at position
        const word = this.getWordAtPosition(event);
        if (word && this.isValidWord(word)) {
          event.preventDefault();
          event.stopPropagation();
          this.showDictionaryPopup(word);
        }
      }
    }
  }

  getWordAtPosition(event) {
    let target = event.target;
    let text = '';

    // get words
    if (target.nodeType === Node.TEXT_NODE) {
      text = target.textContent;
    } else {
      text = target.textContent || '';
    }

    
    const offset = event.clientX - target.getBoundingClientRect().left;
    const charIndex = Math.floor((offset / target.offsetWidth) * text.length);

    
    const leftBound = text.lastIndexOf(' ', charIndex) + 1;
    const rightBound = text.indexOf(' ', charIndex);
    const word = text.substring(leftBound, rightBound === -1 ? text.length : rightBound).trim();

    return word.replace(/[^\w'-]/g, ''); 
  }

  isValidWord(word) {
    
    return word && word.length > 1 && /^[a-zA-Z'-]+$/.test(word) && word.length < 30;
  }

  async showDictionaryPopup(word) {
    // remove existing popup
    this.removeExistingPopup();

    // create popup
    const popup = document.createElement('div');
    popup.className = 'dictionary-popup-modal';
    popup.innerHTML = `
          <div class="dictionary-loader">
            searching "${word}"...
          </div>
        `;

    // position
    this.positionPopup(popup, event);

    document.body.appendChild(popup);

    try {
      // fetch Dictionary Data
      const dictionaryData = await this.fetchDictionaryData(word);
      this.updatePopupContent(popup, word, dictionaryData);
    } catch (error) {
      console.error('Dictionary lookup failed:', error);
      popup.innerHTML = `
            <div class="dictionary-error">
              error: ${error.message}
            </div>
          `;
    }
  }

  async fetchDictionaryData(word) {
    // API
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

    if (!response.ok) {
      throw new Error('cannot find words');
    }

    const data = await response.json();
    return data[0]; // return data
  }

  updatePopupContent(popup, word, data) {
    if (!data) {
      popup.innerHTML = `<div class="dictionary-error">cannot find word "${word}"</div>`;
      return;
    }

    let content = `
          <div class="dictionary-popup-header">
            <h3 class="dictionary-word">${word}</h3>
            <button class="dictionary-close-btn" onclick="this.closest('.dictionary-popup-modal').remove()">×</button>
          </div>
        `;

    
    if (data.phonetic) {
      content += `<div class="dictionary-pronunciation">/${data.phonetic}/</div>`;
    }

    // definition
    content += `<div class="dictionary-popup-content">`;
    if (data.meanings && data.meanings.length > 0) {
      data.meanings.slice(0, 3).forEach((meaning, index) => {
        content += `<div class="dictionary-definition">`;
        content += `<strong>${meaning.partOfSpeech}</strong>: `;
        if (meaning.definitions && meaning.definitions.length > 0) {
          content += meaning.definitions[0].definition;
        }
        content += `</div>`;
      });
    }
    content += `</div>`;

    content += `
            <div class="dictionary-source">
              source: <a href="https://en.wiktionary.org/wiki/${word}" target="_blank">Wiktionary</a>
            </div>
        `;

    popup.innerHTML = content;

    // close
    setTimeout(() => {
      document.addEventListener('click', this.closePopupOnClickOutside.bind(this), { once: true });
    }, 100);
  }

  positionPopup(popup, event) {
    const rect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = event.clientX;
    let top = event.clientY + 10;

    
    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 10;
    }

    if (top + rect.height > viewportHeight) {
      top = event.clientY - rect.height - 10;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  removeExistingPopup() {
    const existingPopup = document.querySelector('.dictionary-popup-modal');
    if (existingPopup) {
      existingPopup.remove();
    }
  }

  closePopupOnClickOutside(event) {
    const popup = document.querySelector('.dictionary-popup-modal');
    if (popup && !popup.contains(event.target) && !event.target.closest('.dictionary-close-btn')) {
      this.removeExistingPopup();
    }
  }
}

module.exports = DictionaryPlugin;
