const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));


const users = new Map();          
const rooms = new Map();           
const globalMessages = [];         


app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Главная страница',
        rooms: Array.from(rooms.keys())
    });
});

app.get('/chat', (req, res) => {
    res.render('chat', { title: 'Угадай число - Игра' });
});



io.on('connection', (socket) => {
    console.log(`Новое подключение: ${socket.id}`);

    socket.on('join-game', (data) => {
        const { playerName, roomName, maxNumber } = data;
        
        if (!playerName || !roomName) {
            socket.emit('error', 'Введите имя и название комнаты');
            return;
        }

        if (!rooms.has(roomName)) {
            const target = Math.floor(Math.random() * (maxNumber || 100)) + 1;
            rooms.set(roomName, {
                targetNumber: target,
                maxNumber: maxNumber || 100,
                gameActive: true,
                messages: [],
                players: new Set()
            });
            console.log(`Создана комната ${roomName}, загадано число: ${target}`);
        }

        const room = rooms.get(roomName);
        
        socket.join(roomName);
        room.players.add(socket.id);


        users.set(socket.id, {
            name: playerName,
            room: roomName,
            score: 0,
            attempts: 0
        });


        socket.emit('message-history', room.messages);


        const joinMsg = {
            id: Date.now(),
            type: 'system',
            text: `👋 ${playerName} присоединился к игре!`,
            timestamp: new Date().toLocaleTimeString('ru-RU')
        };
        room.messages.push(joinMsg);
        io.to(roomName).emit('new-message', joinMsg);

        updatePlayersList(roomName);

        socket.emit('game-info', {
            maxNumber: room.maxNumber,
            gameActive: room.gameActive,
            yourName: playerName
        });

        if (!room.gameActive) {
            socket.emit('system-message', {
                text: `ℹ️ Игра уже завершена. Загаданное число было: ${room.targetNumber}. Создайте новую комнату для новой игры.`
            });
        }
    });


    socket.on('send-message', (text) => {
        const user = users.get(socket.id);
        if (!user) return;

        const room = rooms.get(user.room);
        if (!room) return;

        const timestamp = new Date().toLocaleTimeString('ru-RU');


        const guess = parseInt(text.trim());

        if (!isNaN(guess) && room.gameActive) {
          
            user.attempts++;
            
            let resultMsg;
            let msgType = 'guess';

            if (guess === room.targetNumber) {
                
                user.score += Math.max(100 - user.attempts * 5, 10);
                room.gameActive = false;
                
                resultMsg = {
                    id: Date.now(),
                    type: 'win',
                    author: user.name,
                    text: `🎉 ${user.name} угадал число ${room.targetNumber} с ${user.attempts} попытки!`,
                    guess: guess,
                    result: 'win',
                    timestamp: timestamp
                };

                
                room.messages.push(resultMsg);
                io.to(user.room).emit('new-message', resultMsg);
                
                
                updatePlayersList(user.room);
                
                
                setTimeout(() => {
                    const newGameMsg = {
                        id: Date.now(),
                        type: 'system',
                        text: `🔄 Создайте новую комнату для новой игры!`,
                        timestamp: new Date().toLocaleTimeString('ru-RU')
                    };
                    room.messages.push(newGameMsg);
                    io.to(user.room).emit('new-message', newGameMsg);
                }, 2000);

            } else if (guess < room.targetNumber) {
                resultMsg = {
                    id: Date.now(),
                    type: 'guess',
                    author: user.name,
                    text: `${user.name}: ${guess} — слишком мало! загаданное число больше`,
                    guess: guess,
                    result: 'low',
                    timestamp: timestamp
                };
                room.messages.push(resultMsg);
                io.to(user.room).emit('new-message', resultMsg);

            } else {
                resultMsg = {
                    id: Date.now(),
                    type: 'guess',
                    author: user.name,
                    text: `${user.name}: ${guess} — слишком много! загаданное число меньше`,
                    guess: guess,
                    result: 'high',
                    timestamp: timestamp
                };
                room.messages.push(resultMsg);
                io.to(user.room).emit('new-message', resultMsg);
            }

        } else {
            
            const chatMsg = {
                id: Date.now(),
                type: 'chat',
                author: user.name,
                text: text,
                timestamp: timestamp
            };
            room.messages.push(chatMsg);
            io.to(user.room).emit('new-message', chatMsg);
        }

       
        if (room.messages.length > 100) {
            room.messages = room.messages.slice(-100);
        }
    });

    socket.on('typing', (isTyping) => {
        const user = users.get(socket.id);
        if (!user) return;
        
        socket.to(user.room).emit('user-typing', {
            name: user.name,
            isTyping: isTyping
        });
    });


    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            const room = rooms.get(user.room);
            if (room) {
                room.players.delete(socket.id);
                
                const leaveMsg = {
                    id: Date.now(),
                    type: 'system',
                    text: `👋 ${user.name} покинул игру`,
                    timestamp: new Date().toLocaleTimeString('ru-RU')
                };
                room.messages.push(leaveMsg);
                io.to(user.room).emit('new-message', leaveMsg);
                
                updatePlayersList(user.room);

                if (room.players.size === 0) {
                    rooms.delete(user.room);
                    console.log(`Комната ${user.room} удалена (пустая)`);
                }
            }
            users.delete(socket.id);
        }
        console.log(`Отключение: ${socket.id}`);
    });

    function updatePlayersList(roomName) {
        const room = rooms.get(roomName);
        if (!room) return;

        const playersList = [];
        room.players.forEach(socketId => {
            const player = users.get(socketId);
            if (player) {
                playersList.push({
                    name: player.name,
                    score: player.score,
                    attempts: player.attempts
                });
            }
        });

        playersList.sort((a, b) => b.score - a.score);

        io.to(roomName).emit('players-list', playersList);
    }
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(` Сервер запущен на порту ${PORT}`);
    console.log(` Откройте http://localhost:${PORT}`);
});
