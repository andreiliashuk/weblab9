
const socket = io();


const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const loginForm = document.getElementById('login-form');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const playersList = document.getElementById('players-list');
const typingIndicator = document.getElementById('typing-indicator');
const roomTitle = document.getElementById('room-title');
const rangeInfo = document.getElementById('range-info');
const gameStatus = document.getElementById('game-status');

let currentPlayerName = '';
let typingTimeout = null;

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const playerName = document.getElementById('player-name').value.trim();
    const roomName = document.getElementById('room-name').value.trim();
    const maxNumber = parseInt(document.getElementById('max-number').value) || 100;
    
    if (!playerName || !roomName) return;
    
    currentPlayerName = playerName;
    

    loginScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    roomTitle.textContent = `Комната: ${roomName}`;
    

    socket.emit('join-game', {
        playerName: playerName,
        roomName: roomName,
        maxNumber: maxNumber
    });
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    
    socket.emit('send-message', text);
    messageInput.value = '';
    messageInput.focus();
 
    socket.emit('typing', false);
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});


messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
});


socket.on('message-history', (messages) => {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => displayMessage(msg));
    scrollToBottom();
});


socket.on('new-message', (msg) => {
    displayMessage(msg);
    scrollToBottom();
});


socket.on('system-message', (data) => {
    const msg = {
        type: 'system',
        text: data.text,
        timestamp: new Date().toLocaleTimeString('ru-RU')
    };
    displayMessage(msg);
    scrollToBottom();
});

socket.on('players-list', (players) => {
    updatePlayersList(players);
});


socket.on('game-info', (data) => {
    rangeInfo.textContent = `1 - ${data.maxNumber}`;
    if (!data.gameActive) {
        gameStatus.textContent = ' Завершена';
        gameStatus.style.color = '#e53935';
    }
});


socket.on('user-typing', (data) => {
    if (data.isTyping) {
        typingIndicator.textContent = `${data.name} печатает...`;
    } else {
        typingIndicator.textContent = '';
    }
});


socket.on('error', (msg) => {
    alert('Ошибка: ' + msg);
});


function displayMessage(msg) {
    const div = document.createElement('div');
    div.className = `message message-${msg.type}`;
    
    let content = '';
    
    switch(msg.type) {
        case 'system':
            content = `<div class="msg-text">${escapeHtml(msg.text)}</div>`;
            break;
            
        case 'chat':
            content = `
                <div class="msg-author">${escapeHtml(msg.author)}</div>
                <div class="msg-text">${escapeHtml(msg.text)}</div>
                <div class="msg-time">${msg.timestamp}</div>
            `;
            break;
            
        case 'guess':
            content = `
                <div class="msg-author"> ${escapeHtml(msg.author)}</div>
                <div class="msg-text">${escapeHtml(msg.text)}</div>
                <div class="msg-time">${msg.timestamp}</div>
            `;
            break;
            
        case 'win':
            content = `
                <div class="msg-text"> ${escapeHtml(msg.text)}</div>
                <div class="msg-time">${msg.timestamp}</div>
            `;
            break;
    }
    
    div.innerHTML = content;
    messagesContainer.appendChild(div);
}

function updatePlayersList(players) {
    playersList.innerHTML = '';
    
    if (players.length === 0) {
        playersList.innerHTML = '<p style="color: #888; text-align: center;">Нет игроков</p>';
        return;
    }
    
    players.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        
        
        div.innerHTML = `
            <span class="player-name">${medal} ${escapeHtml(player.name)}</span>
            <span class="player-score">${player.score} очк.</span>
        `;
        playersList.appendChild(div);
    });
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
