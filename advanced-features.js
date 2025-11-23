// Advanced Features for Gemini Wrapper
// This file extends script.js with 10 powerful new features

// Feature 1: Copy Code Blocks
function addCopyButtonsToCodeBlocks() {
    document.querySelectorAll('.message-text pre').forEach((pre, index) => {
        if (pre.querySelector('.code-copy-btn')) return; // Already has button
        
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        
        const button = document.createElement('button');
        button.className = 'code-copy-btn';
        button.textContent = 'Copy';
        button.onclick = () => {
            const code = pre.querySelector('code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                button.textContent = 'Copied!';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = 'Copy';
                    button.classList.remove('copied');
                }, 2000);
            });
        };
        wrapper.appendChild(button);
    });
}

// Feature 2: Export Conversations
function exportConversation(format) {
    const conversation = window.getActiveConversation();
    if (!conversation) return;
    
    let content, filename, mimeType;
    
    if (format === 'markdown') {
        content = `# ${conversation.title}\n\n`;
        conversation.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : 'Gemini';
            content += `## ${role}\n\n${msg.content}\n\n`;
        });
        filename = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}.md`;
        mimeType = 'text/markdown';
    } else if (format === 'json') {
        content = JSON.stringify(conversation, null, 2);
        filename = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}.json`;
        mimeType = 'application/json';
    } else { // txt
        content = `${conversation.title}\n${'='.repeat(conversation.title.length)}\n\n`;
        conversation.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : 'Gemini';
            content += `${role}:\n${msg.content}\n\n${'='.repeat(50)}\n\n`;
        });
        filename = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
        mimeType = 'text/plain';
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Export Complete', `Conversation exported as ${format.toUpperCase()}`, '📥');
}

// Feature 3: Search Conversations
let searchTimeout;
function handleSearch(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (!query.trim()) {
            window.renderConversations();
            return;
        }
        
        const filtered = window.state.conversations.filter(conv => {
            const titleMatch = conv.title.toLowerCase().includes(query.toLowerCase());
            const messageMatch = conv.messages.some(msg => 
                msg.content.toLowerCase().includes(query.toLowerCase())
            );
            return titleMatch || messageMatch;
        });
        
        const list = document.getElementById('conversationsList');
        if (filtered.length === 0) {
            list.innerHTML = '<p style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No results found</p>';
        } else {
            list.innerHTML = filtered.map(conv => {
                const isActive = conv.id === window.state.activeConversationId;
                return `
                    <div class="conversation-item ${isActive ? 'active' : ''}" onclick="window.switchConversation('${conv.id}')">
                        <div class="conversation-title">${window.escapeHtml(conv.title)}</div>
                    </div>
                `;
            }).join('');
        }
    }, 300);
}

// Feature 4: Message Actions
function addMessageActions(messageElement, messageIndex) {
    const conversation = window.getActiveConversation();
    if (!conversation) return;
    
    const message = conversation.messages[messageIndex];
    const actionsHTML = `
        <div class="message-actions">
            <button class="message-action-btn" onclick="copyMessageText(${messageIndex})">
                📋 Copy
            </button>
            ${message.role === 'assistant' ? `
                <button class="message-action-btn" onclick="regenerateResponse(${messageIndex})">
                    🔄 Regenerate
                </button>
            ` : ''}
            <button class="message-action-btn" onclick="deleteMessage(${messageIndex})">
                🗑️ Delete
            </button>
        </div>
    `;
    
    const content = messageElement.querySelector('.message-content');
    if (content && !content.querySelector('.message-actions')) {
        content.insertAdjacentHTML('beforeend', actionsHTML);
    }
}

window.copyMessageText = function(index) {
    const conversation = window.getActiveConversation();
    const message = conversation.messages[index];
    navigator.clipboard.writeText(message.content);
    showNotification('Copied', 'Message copied to clipboard', '📋');
};

window.deleteMessage = function(index) {
    if (!confirm('Delete this message?')) return;
    const conversation = window.getActiveConversation();
    conversation.messages.splice(index, 1);
    window.saveState();
    window.renderMessages();
    showNotification('Deleted', 'Message removed', '🗑️');
};

window.regenerateResponse = async function(index) {
    const conversation = window.getActiveConversation();
    // Remove the assistant message and regenerate
    conversation.messages.splice(index, 1);
    window.saveState();
    window.renderMessages();
    
    // Trigger regeneration by simulating send
    window.state.isLoading = true;
    window.renderMessages();
    
    // Call the API with history up to this point
    try {
        const contents = conversation.messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
        }));
        
        const response = await fetch(
            `${window.GEMINI_API_BASE}/${window.state.currentModel}:generateContent?key=${window.state.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            }
        );
        
        const data = await response.json();
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
        conversation.messages.push({ role: 'assistant', content: aiResponse, timestamp: Date.now() });
        window.saveState();
    } catch (error) {
        conversation.messages.push({ role: 'assistant', content: `Error: ${error.message}`, timestamp: Date.now() });
    } finally {
        window.state.isLoading = false;
        window.renderMessages();
    }
};

// Feature 5: Voice Input
let recognition;
let isRecording = false;

function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('inputField').value = transcript;
            window.handleInputChange();
        };
        
        recognition.onend = () => {
            isRecording = false;
            const btn = document.getElementById('btnVoice');
            if (btn) btn.classList.remove('recording');
        };
        
        return true;
    }
    return false;
}

window.toggleVoiceInput = function() {
    if (!recognition) {
        showNotification('Not Supported', 'Voice input is not supported in this browser', '⚠️');
        return;
    }
    
    if (isRecording) {
        recognition.stop();
        isRecording = false;
        document.getElementById('btnVoice').classList.remove('recording');
    } else {
        recognition.start();
        isRecording = true;
        document.getElementById('btnVoice').classList.add('recording');
        showNotification('Listening...', 'Speak now', '🎤');
    }
};

// Feature 6: Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K: New chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            window.handleNewChat();
        }
        
        // Ctrl/Cmd + /: Show shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            toggleShortcutsModal();
        }
        
        // Ctrl/Cmd + E: Export current conversation
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportConversation('markdown');
        }
        
        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
        
        // Ctrl/Cmd + S: Save prompt
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const text = document.getElementById('inputField').value.trim();
            if (text) savePrompt(text);
        }
        
        // Esc: Clear input or close modals
        if (e.key === 'Escape') {
            document.getElementById('inputField').value = '';
            window.handleInputChange();
            closeShortcutsModal();
        }
    });
}

function toggleShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (!modal) {
        createShortcutsModal();
    } else {
        modal.classList.toggle('active');
    }
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.classList.remove('active');
}

function createShortcutsModal() {
    const modal = document.createElement('div');
    modal.id = 'shortcutsModal';
    modal.className = 'shortcuts-modal';
    modal.innerHTML = `
        <div class="shortcuts-content">
            <div class="shortcuts-header">
                <div class="shortcuts-title">Keyboard Shortcuts</div>
                <button class="btn-icon" onclick="closeShortcutsModal()">✕</button>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">New chat</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Ctrl</span>
                    <span class="shortcut-key">K</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">Search conversations</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Ctrl</span>
                    <span class="shortcut-key">F</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">Export conversation</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Ctrl</span>
                    <span class="shortcut-key">E</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">Save prompt</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Ctrl</span>
                    <span class="shortcut-key">S</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">Show shortcuts</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Ctrl</span>
                    <span class="shortcut-key">/</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">Clear input</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Esc</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">Send message</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Enter</span>
                </div>
            </div>
            <div class="shortcut-item">
                <div class="shortcut-desc">New line</div>
                <div class="shortcut-keys">
                    <span class="shortcut-key">Shift</span>
                    <span class="shortcut-key">Enter</span>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShortcutsModal();
    });
}

window.closeShortcutsModal = closeShortcutsModal;

// Feature 7: Token Counter
function estimateTokens(text) {
    // Simple estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
}

function updateTokenCounter() {
    const text = document.getElementById('inputField').value;
    const tokens = estimateTokens(text);
    
    let counter = document.querySelector('.token-counter');
    if (!counter) {
        counter = document.createElement('div');
        counter.className = 'token-counter';
        document.querySelector('.input-wrapper').appendChild(counter);
    }
    
    counter.textContent = `~${tokens} tokens`;
    
    // Warning/error states
    counter.classList.remove('warning', 'error');
    if (tokens > 8000) counter.classList.add('error');
    else if (tokens > 6000) counter.classList.add('warning');
}

// Feature 8: Conversation Stats
function updateStats() {
    const conversation = window.getActiveConversation();
    if (!conversation) {
        document.getElementById('statMessages').textContent = '0';
        document.getElementById('statWords').textContent = '0';
        document.getElementById('statTokens').textContent = '0';
        return;
    }
    
    const messageCount = conversation.messages.length;
    let wordCount = 0;
    let tokenCount = 0;
    
    conversation.messages.forEach(msg => {
        const words = msg.content.trim().split(/\s+/).length;
        wordCount += words;
        tokenCount += estimateTokens(msg.content);
    });
    
    document.getElementById('statMessages').textContent = messageCount;
    document.getElementById('statWords').textContent = wordCount;
    document.getElementById('statTokens').textContent = tokenCount;
}

// Feature 9: Custom Prompts Library
function savePrompt(text) {
    const prompts = JSON.parse(localStorage.getItem('saved_prompts') || '[]');
    prompts.unshift({ text, timestamp: Date.now() });
    localStorage.setItem('saved_prompts', JSON.stringify(prompts.slice(0, 20))); // Keep last 20
    renderPrompts();
    showNotification('Prompt Saved', 'Added to your library', '💾');
}

function renderPrompts() {
    const prompts = JSON.parse(localStorage.getItem('saved_prompts') || '[]');
    const list = document.getElementById('promptsList');
    
    if (prompts.length === 0) {
        list.innerHTML = '<p style="padding: 8px; color: var(--text-tertiary); font-size: 12px;">No saved prompts yet</p>';
        return;
    }
    
    list.innerHTML = prompts.map((prompt, index) => `
        <div class="prompt-item" onclick="usePrompt(${index})">
            <div class="prompt-text">${window.escapeHtml(prompt.text)}</div>
            <button class="prompt-delete" onclick="event.stopPropagation(); deletePrompt(${index})" title="Delete">🗑️</button>
        </div>
    `).join('');
}

window.usePrompt = function(index) {
    const prompts = JSON.parse(localStorage.getItem('saved_prompts') || '[]');
    if (prompts[index]) {
        document.getElementById('inputField').value = prompts[index].text;
        window.handleInputChange();
        document.getElementById('inputField').focus();
    }
};

window.deletePrompt = function(index) {
    const prompts = JSON.parse(localStorage.getItem('saved_prompts') || '[]');
    prompts.splice(index, 1);
    localStorage.setItem('saved_prompts', JSON.stringify(prompts));
    renderPrompts();
};

// Feature 10: Image Preview Enhancement
function enhanceImagePreviews() {
    document.querySelectorAll('.message-attachment img').forEach(img => {
        if (img.parentElement.classList.contains('image-preview-wrapper')) return;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-wrapper';
        wrapper.style.cssText = 'position: relative; cursor: pointer;';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        
        const actions = document.createElement('div');
        actions.style.cssText = 'position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;';
        actions.innerHTML = `
            <button onclick="downloadImage(this)" style="padding: 6px 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                💾 Download
            </button>
            <button onclick="zoomImage(this)" style="padding: 6px 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                🔍 Zoom
            </button>
        `;
        wrapper.appendChild(actions);
        
        wrapper.addEventListener('mouseenter', () => actions.style.opacity = '1');
        wrapper.addEventListener('mouseleave', () => actions.style.opacity = '0');
    });
}

window.downloadImage = function(btn) {
    const img = btn.closest('.image-preview-wrapper').querySelector('img');
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `gemini-image-${Date.now()}.png`;
    a.click();
};

window.zoomImage = function(btn) {
    const img = btn.closest('.image-preview-wrapper').querySelector('img');
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center; cursor: zoom-out;';
    modal.innerHTML = `<img src="${img.src}" style="max-width: 90%; max-height: 90%; object-fit: contain;">`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
};

// Initialize all advanced features
function initAdvancedFeatures() {
    // Voice input
    const hasVoice = initVoiceInput();
    if (hasVoice) {
        // Add voice button
        const actions = document.querySelector('.input-actions');
        const voiceBtn = document.createElement('button');
        voiceBtn.id = 'btnVoice';
        voiceBtn.className = 'btn-icon btn-voice';
        voiceBtn.title = 'Voice input';
        voiceBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/></svg>';
        voiceBtn.onclick = window.toggleVoiceInput;
        actions.insertBefore(voiceBtn, actions.firstChild);
    }
    
    // Export button in header
    const headerActions = document.querySelector('.header-actions');
    const exportBtn = document.createElement('div');
    exportBtn.style.position = 'relative';
    exportBtn.innerHTML = `
        <button class="btn-icon" id="btnExport" title="Export conversation">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
            </svg>
        </button>
        <div class="export-menu" id="exportMenu">
            <button class="export-option" onclick="exportConversation('markdown')">Export as Markdown</button>
            <button class="export-option" onclick="exportConversation('json')">Export as JSON</button>
            <button class="export-option" onclick="exportConversation('txt')">Export as Text</button>
        </div>
    `;
    headerActions.insertBefore(exportBtn, headerActions.lastElementChild);
    
    document.getElementById('btnExport').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('exportMenu').classList.toggle('active');
    };
    
    document.addEventListener('click', () => {
        document.getElementById('exportMenu').classList.remove('active');
    });
    
    // Shortcuts button
    const shortcutsBtn = document.createElement('button');
    shortcutsBtn.className = 'btn-icon';
    shortcutsBtn.title = 'Keyboard shortcuts (Ctrl+/)';
    shortcutsBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>';
    shortcutsBtn.onclick = toggleShortcutsModal;
    headerActions.insertBefore(shortcutsBtn, headerActions.lastElementChild);
    
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', (e) => {
        handleSearch(e.target.value);
    });
    
    // Token counter update
    document.getElementById('inputField').addEventListener('input', updateTokenCounter);
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Render prompts
    renderPrompts();
    
    // Update stats
    updateStats();
}

// Export functions to global scope
window.exportConversation = exportConversation;
window.savePrompt = savePrompt;
window.updateStats = updateStats;
window.addCopyButtonsToCodeBlocks = addCopyButtonsToCodeBlocks;
window.addMessageActions = addMessageActions;
window.enhanceImagePreviews = enhanceImagePreviews;
window.initAdvancedFeatures = initAdvancedFeatures;
