// Gemini API Configuration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// State Management
const state = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    currentModel: localStorage.getItem('gemini_model') || 'gemini-2.5-flash',
    conversations: JSON.parse(localStorage.getItem('gemini_conversations') || '[]'),
    activeConversationId: localStorage.getItem('gemini_active_conversation') || null,
    isLoading: false,
    isDarkMode: localStorage.getItem('gemini_theme') === 'dark',
    attachedFiles: []
};

// DOM Elements
const elements = {
    sidebar: document.getElementById('sidebar'),
    btnNewChat: document.getElementById('btnNewChat'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    btnTheme: document.getElementById('btnTheme'),
    conversationsList: document.getElementById('conversationsList'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    messagesContainer: document.getElementById('messagesContainer'),
    inputField: document.getElementById('inputField'),
    btnSend: document.getElementById('btnSend'),
    btnAttach: document.getElementById('btnAttach'),
    fileInput: document.getElementById('fileInput'),
    attachedFilesPreview: document.getElementById('attachedFilesPreview'),
    modelSelect: document.getElementById('modelSelect'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    btnSaveKey: document.getElementById('btnSaveKey'),
    btnClearKey: document.getElementById('btnClearKey'),
    chatArea: document.getElementById('chatArea'),
    dragOverlay: document.getElementById('dragOverlay')
};

// Utility Functions
function generateId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMarkdown(text) {
    let html = text;
    
    // Extract and protect code blocks first
    const codeBlocks = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push({ lang: lang || 'text', code: code.trim() });
        return `__CODE_BLOCK_${index}__`;
    });
    
    // Escape HTML in remaining text
    html = escapeHtml(html);
    
    // Format inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format bold and italic (order matters!)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Format headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Format lists
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // Wrap consecutive list items in ul/ol tags
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
        return `<ul>${match}</ul>`;
    });
    
    // Convert line breaks to <br>
    html = html.replace(/\n/g, '<br>');
    
    // Restore code blocks with syntax highlighting
    codeBlocks.forEach((block, index) => {
        const highlighted = highlightCode(block.code, block.lang);
        html = html.replace(`__CODE_BLOCK_${index}__`, 
            `<pre><code class="language-${block.lang}">${highlighted}</code></pre>`);
    });
    
    return html;
}

function highlightCode(code, lang) {
    if (typeof hljs !== 'undefined') {
        try {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        } catch (e) {
            console.error('Highlighting error:', e);
        }
    }
    return escapeHtml(code);
}

// File Upload Functions
async function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            await processImage(file);
        } else if (file.type === 'application/pdf') {
            await processPDF(file);
        }
    }
    
    // Clear the input
    elements.fileInput.value = '';
    renderAttachedFiles();
    updateSendButton();
}

async function processImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            state.attachedFiles.push({
                type: 'image',
                name: file.name,
                data: e.target.result,
                mimeType: file.type
            });
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

async function processPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        
        state.attachedFiles.push({
            type: 'pdf',
            name: file.name,
            data: fullText.trim(),
            mimeType: 'application/pdf'
        });
    } catch (error) {
        console.error('Error processing PDF:', error);
        alert('Error processing PDF file');
    }
}

function renderAttachedFiles() {
    if (state.attachedFiles.length === 0) {
        elements.attachedFilesPreview.innerHTML = '';
        elements.attachedFilesPreview.style.display = 'none';
        return;
    }
    
    elements.attachedFilesPreview.style.display = 'flex';
    elements.attachedFilesPreview.innerHTML = state.attachedFiles.map((file, index) => {
        const icon = file.type === 'image' 
            ? `<img src="${file.data}" class="attached-file-icon" alt="${file.name}">`
            : `<span class="pdf-icon">📄</span>`;
        
        return `
            <div class="attached-file">
                ${icon}
                <span>${file.name}</span>
                <button class="attached-file-remove" onclick="window.removeAttachedFile(${index})" title="Remove">
                    ✕
                </button>
            </div>
        `;
    }).join('');
}

function removeAttachedFile(index) {
    state.attachedFiles.splice(index, 1);
    renderAttachedFiles();
    updateSendButton();
}

// Conversation Management
function createConversation() {
    const conversation = {
        id: generateId(),
        title: 'New conversation',
        messages: [],
        createdAt: Date.now(),
        model: state.currentModel
    };
    
    state.conversations.unshift(conversation);
    state.activeConversationId = conversation.id;
    saveState();
    
    return conversation;
}

function getActiveConversation() {
    return state.conversations.find(c => c.id === state.activeConversationId);
}

function updateConversationTitle(conversationId, title) {
    const conversation = state.conversations.find(c => c.id === conversationId);
    if (conversation) {
        conversation.title = title.slice(0, 60);
        saveState();
        renderConversations();
    }
}

function deleteConversation(conversationId) {
    const index = state.conversations.findIndex(c => c.id === conversationId);
    if (index !== -1) {
        state.conversations.splice(index, 1);
        
        if (state.activeConversationId === conversationId) {
            if (state.conversations.length > 0) {
                state.activeConversationId = state.conversations[0].id;
            } else {
                createConversation();
            }
        }
        
        saveState();
        renderConversations();
        renderMessages();
    }
}

function switchConversation(conversationId) {
    if (state.isLoading) return;
    
    state.activeConversationId = conversationId;
    localStorage.setItem('gemini_active_conversation', conversationId);
    
    const conversation = getActiveConversation();
    if (conversation) {
        state.currentModel = conversation.model;
        elements.modelSelect.value = conversation.model;
    }
    
    renderConversations();
    renderMessages();
}

// Message Management
function addMessage(role, content, attachments = []) {
    const conversation = getActiveConversation();
    if (!conversation) return;
    
    conversation.messages.push({
        role,
        content,
        attachments,
        timestamp: Date.now()
    });
    
    // Update conversation title based on first user message
    if (role === 'user' && conversation.messages.length === 1) {
        const title = content.slice(0, 40) + (content.length > 40 ? '...' : '');
        updateConversationTitle(conversation.id, title);
    }
    
    saveState();
}

function renderMessages() {
    const conversation = getActiveConversation();
    
    if (!conversation || conversation.messages.length === 0) {
        elements.welcomeScreen.style.display = 'flex';
        elements.messagesContainer.style.display = 'none';
        return;
    }
    
    elements.welcomeScreen.style.display = 'none';
    elements.messagesContainer.style.display = 'block';
    
    elements.messagesContainer.innerHTML = conversation.messages.map(msg => {
        const isUser = msg.role === 'user';
        const attachmentsHtml = msg.attachments && msg.attachments.length > 0 
            ? msg.attachments.map(att => {
                if (att.type === 'image') {
                    return `<div class="message-attachment"><img src="${att.data}" alt="${att.name}"></div>`;
                } else if (att.type === 'pdf') {
                    return `<div class="message-attachment pdf"><span class="pdf-icon">📄</span><span>${att.name}</span></div>`;
                }
                return '';
            }).join('')
            : '';
        
        return `
            <div class="message">
                <div class="message-avatar ${isUser ? 'user' : 'assistant'}">
                    ${isUser ? 'You' : `
                        <svg viewBox="0 0 24 24">
                            <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
                        </svg>
                    `}
                </div>
                <div class="message-content">
                    ${attachmentsHtml}
                    <div class="message-text">${formatMarkdown(msg.content)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    if (state.isLoading) {
        elements.messagesContainer.innerHTML += `
            <div class="message">
                <div class="message-avatar assistant">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
                    </svg>
                </div>
                <div class="message-content">
                    <div class="loading-dots">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Scroll to bottom
    setTimeout(() => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
        
        // Apply advanced features to rendered messages
        if (typeof window.addCopyButtonsToCodeBlocks === 'function') {
            window.addCopyButtonsToCodeBlocks();
        }
        if (typeof window.enhanceImagePreviews === 'function') {
            window.enhanceImagePreviews();
        }
        if (typeof window.addMessageActions === 'function') {
            document.querySelectorAll('.message').forEach((el, idx) => {
                window.addMessageActions(el, idx);
            });
        }
        if (typeof window.updateStats === 'function') {
            window.updateStats();
        }
    }, 100);
}

function renderConversations() {
    if (state.conversations.length === 0) {
        elements.conversationsList.innerHTML = '<p style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No conversations yet</p>';
        return;
    }
    
    elements.conversationsList.innerHTML = state.conversations.map(conv => {
        const isActive = conv.id === state.activeConversationId;
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" onclick="window.switchConversation('${conv.id}')">
                <div class="conversation-title">${escapeHtml(conv.title)}</div>
                <div class="conversation-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon" onclick="window.renameConversation('${conv.id}')" title="Rename">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="window.deleteConversation('${conv.id}')" title="Delete">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// API Communication
async function sendMessage() {
    const message = elements.inputField.value.trim();
    
    if ((!message && state.attachedFiles.length === 0) || state.isLoading) return;
    
    if (!state.apiKey) {
        alert('Please enter your Gemini API key in the sidebar.');
        return;
    }
    
    // Prepare attachments
    const attachments = [...state.attachedFiles];
    
    // Clear input and attachments
    elements.inputField.value = '';
    elements.inputField.style.height = 'auto';
    elements.btnSend.disabled = true;
    state.attachedFiles = [];
    renderAttachedFiles();
    
    // Build prompt with context
    let fullPrompt = message;
    if (attachments.length > 0) {
        const pdfTexts = attachments.filter(a => a.type === 'pdf').map(a => 
            `\n\n[PDF Content from ${a.name}]:\n${a.data}`
        ).join('');
        
        if (pdfTexts) {
            fullPrompt += pdfTexts;
        }
    }
    
    // Add user message
    addMessage('user', message, attachments);
    renderMessages();
    
    // Set loading state
    state.isLoading = true;
    renderMessages();
    
    try {
        const conversation = getActiveConversation();
        
        // Build contents array for API
        const contents = [];
        
        // Add conversation history
        for (const msg of conversation.messages) {
            const parts = [];
            
            // Add text
            if (msg.content) {
                parts.push({ text: msg.content });
            }
            
            // Add images
            if (msg.attachments) {
                for (const att of msg.attachments) {
                    if (att.type === 'image') {
                        // Extract base64 data
                        const base64Data = att.data.split(',')[1];
                        parts.push({
                            inlineData: {
                                mimeType: att.mimeType,
                                data: base64Data
                            }
                        });
                    }
                }
            }
            
            contents.push({
                role: msg.role === 'assistant' ? 'model' : msg.role,
                parts
            });
        }
        
        const response = await fetch(
            `${GEMINI_API_BASE}/${state.currentModel}:generateContent?key=${state.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ contents })
            }
        );
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || 'API Error');
        }
        
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
        addMessage('assistant', aiResponse);
        
    } catch (error) {
        console.error('Error:', error);
        addMessage('assistant', `Error: ${error.message}`);
    } finally {
        state.isLoading = false;
        renderMessages();
        elements.inputField.focus();
    }
}

// Event Handlers
function handleNewChat() {
    createConversation();
    state.attachedFiles = [];
    renderAttachedFiles();
    renderConversations();
    renderMessages();
    elements.inputField.focus();
}

function handleSend() {
    sendMessage();
}

function updateSendButton() {
    const hasText = elements.inputField.value.trim().length > 0;
    const hasFiles = state.attachedFiles.length > 0;
    elements.btnSend.disabled = (!hasText && !hasFiles) || state.isLoading;
}

function handleInputChange() {
    updateSendButton();
    
    // Auto-resize textarea
    elements.inputField.style.height = 'auto';
    const newHeight = Math.min(elements.inputField.scrollHeight, 200);
    elements.inputField.style.height = newHeight + 'px';
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleModelChange() {
    state.currentModel = elements.modelSelect.value;
    localStorage.setItem('gemini_model', state.currentModel);
    
    const conversation = getActiveConversation();
    if (conversation) {
        conversation.model = state.currentModel;
        saveState();
    }
}

function handleSaveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    state.apiKey = key;
    localStorage.setItem('gemini_api_key', key);
    
    const originalText = elements.btnSaveKey.textContent;
    elements.btnSaveKey.textContent = '✓ Saved';
    setTimeout(() => {
        elements.btnSaveKey.textContent = originalText;
    }, 2000);
}

function handleClearApiKey() {
    state.apiKey = '';
    elements.apiKeyInput.value = '';
    localStorage.removeItem('gemini_api_key');
}

function handleToggleSidebar() {
    elements.sidebar.classList.toggle('hidden');
}

function handleToggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    document.body.classList.toggle('dark', state.isDarkMode);
    localStorage.setItem('gemini_theme', state.isDarkMode ? 'dark' : 'light');
    
    const lightIcon = elements.btnTheme.querySelector('.icon-light');
    const darkIcon = elements.btnTheme.querySelector('.icon-dark');
    const highlightLight = document.getElementById('highlight-light');
    const highlightDark = document.getElementById('highlight-dark');
    
    if (state.isDarkMode) {
        lightIcon.style.display = 'none';
        darkIcon.style.display = 'block';
        highlightLight.disabled = true;
        highlightDark.disabled = false;
    } else {
        lightIcon.style.display = 'block';
        darkIcon.style.display = 'none';
        highlightLight.disabled = false;
        highlightDark.disabled = true;
    }
}

function handleChipClick(e) {
    const chip = e.target.closest('.chip');
    if (chip) {
        const prompt = chip.dataset.prompt;
        elements.inputField.value = prompt;
        handleInputChange();
        elements.inputField.focus();
    }
}

// Export necessary data and functions to window scope
window.GEMINI_API_BASE = GEMINI_API_BASE;
window.state = state;
window.getActiveConversation = getActiveConversation;
window.saveState = saveState;
window.renderMessages = renderMessages;
window.renderConversations = renderConversations;
window.handleNewChat = handleNewChat;
window.handleInputChange = handleInputChange;
window.escapeHtml = escapeHtml;
window.showNotification = showNotification;

// Global functions for inline event handlers
window.switchConversation = switchConversation;
window.removeAttachedFile = removeAttachedFile;
window.renameConversation = (id) => {
    const conversation = state.conversations.find(c => c.id === id);
    if (conversation) {
        const newTitle = prompt('Enter new title:', conversation.title);
        if (newTitle && newTitle.trim()) {
            updateConversationTitle(id, newTitle.trim());
        }
    }
};
window.deleteConversation = (id) => {
    if (confirm('Delete this conversation?')) {
        deleteConversation(id);
    }
};

// Notification System
function showNotification(title, message, icon = 'ℹ️') {
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('hiding');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Drag and Drop Handlers
let dragCounter = 0;

function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (dragCounter === 1) {
        elements.dragOverlay.classList.add('active');
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
        elements.dragOverlay.classList.remove('active');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounter = 0;
    elements.dragOverlay.classList.remove('active');
    
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) return;
    
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            await processImage(file);
            showNotification('Image Added', `${file.name} is ready to send`, '🖼️');
        } else if (file.type === 'application/pdf') {
            await processPDF(file);
            showNotification('PDF Added', `${file.name} has been processed`, '📄');
        } else {
            showNotification('Unsupported File', `${file.name} is not supported. Please use images or PDFs.`, '⚠️');
        }
    }
    
    renderAttachedFiles();
    updateSendButton();
}

// Check API Key and Update UI
function checkApiKey() {
    const hasApiKey = state.apiKey && state.apiKey.trim().length > 0;
    
    // Disable model select if no API key
    elements.modelSelect.disabled = !hasApiKey;
    
    if (!hasApiKey) {
        elements.modelSelect.style.opacity = '0.5';
        elements.modelSelect.style.cursor = 'not-allowed';
        elements.modelSelect.title = 'Enter API key to select model';
    } else {
        elements.modelSelect.style.opacity = '1';
        elements.modelSelect.style.cursor = 'pointer';
        elements.modelSelect.title = '';
    }
}

// Override model select click when no API key
function handleModelSelectClick(e) {
    if (!state.apiKey || state.apiKey.trim().length === 0) {
        e.preventDefault();
        showNotification(
            'API Key Required',
            'Please enter your Gemini API key in the sidebar before selecting a model.',
            '🔑'
        );
    }
}

// State Persistence
function saveState() {
    localStorage.setItem('gemini_conversations', JSON.stringify(state.conversations));
    localStorage.setItem('gemini_active_conversation', state.activeConversationId);
}

// Initialize Application
function init() {
    // Apply theme
    document.body.classList.toggle('dark', state.isDarkMode);
    const lightIcon = elements.btnTheme.querySelector('.icon-light');
    const darkIcon = elements.btnTheme.querySelector('.icon-dark');
    const highlightLight = document.getElementById('highlight-light');
    const highlightDark = document.getElementById('highlight-dark');
    
    if (state.isDarkMode) {
        lightIcon.style.display = 'none';
        darkIcon.style.display = 'block';
        if (highlightLight) highlightLight.disabled = true;
        if (highlightDark) highlightDark.disabled = false;
    }
    
    // Set API key
    elements.apiKeyInput.value = state.apiKey;
    
    // Set model
    elements.modelSelect.value = state.currentModel;
    
    // Create initial conversation if none exist
    if (state.conversations.length === 0) {
        createConversation();
    }
    
    // Set active conversation
    if (!state.activeConversationId || !getActiveConversation()) {
        state.activeConversationId = state.conversations[0].id;
    }
    
    // Render UI
    renderConversations();
    renderMessages();
    renderAttachedFiles();
    
    // Event listeners
    elements.btnNewChat.addEventListener('click', handleNewChat);
    elements.btnSend.addEventListener('click', handleSend);
    elements.btnAttach.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.inputField.addEventListener('input', handleInputChange);
    elements.inputField.addEventListener('keypress', handleKeyPress);
    elements.modelSelect.addEventListener('change', handleModelChange);
    elements.modelSelect.addEventListener('mousedown', handleModelSelectClick);
    elements.btnSaveKey.addEventListener('click', () => {
        handleSaveApiKey();
        checkApiKey();
        showNotification('API Key Saved', 'Your API key has been saved successfully', '✅');
    });
    elements.btnClearKey.addEventListener('click', () => {
        handleClearApiKey();
        checkApiKey();
        showNotification('API Key Cleared', 'Your API key has been removed', 'ℹ️');
    });
    elements.btnToggleSidebar.addEventListener('click', handleToggleSidebar);
    elements.btnTheme.addEventListener('click', handleToggleTheme);
    
    // Drag and drop event listeners
    document.body.addEventListener('dragenter', handleDragEnter);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('drop', handleDrop);
    
    // Suggestion chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', handleChipClick);
    });
    
    // Check API key state on init
    checkApiKey();
    
    // Initialize advanced features after DOM is ready
    setTimeout(() => {
        if (typeof window.initAdvancedFeatures === 'function') {
            window.initAdvancedFeatures();
        }
    }, 100);
    
    // Focus input
    elements.inputField.focus();
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
