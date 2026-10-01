const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const publicDirectory = __dirname;
const port = Number.parseInt(process.env.PORT || '3000', 10);
const roomLifetimeMs = 2 * 60 * 60 * 1000;
const maximumRooms = 1000;
const rooms = new Map();
const moveNames = new Set(['rock', 'paper', 'scissors']);
const publicFiles = new Set(['index.html', 'script.js', 'style.css']);
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(payload));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1024) {
                reject(new Error('Request body is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error('Request body must be valid JSON.'));
            }
        });
        request.on('error', reject);
    });
}

function cleanExpiredRooms() {
    const cutoff = Date.now() - roomLifetimeMs;
    for (const [roomId, room] of rooms) {
        if (room.updatedAt < cutoff) {
            rooms.delete(roomId);
        }
    }
}

function newPlayerId() {
    return crypto.randomBytes(24).toString('hex');
}

function validPlayerName(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 24;
}

function createRoom(playerName) {
    let roomId;
    do {
        roomId = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (rooms.has(roomId));

    const playerId = newPlayerId();
    rooms.set(roomId, {
        players: { host: playerId, guest: null },
        names: { host: playerName, guest: null },
        pendingMoves: {},
        round: 0,
        lastResult: null,
        updatedAt: Date.now()
    });
    return { roomId, playerId, playerName };
}

function roleForPlayer(room, playerId) {
    if (room.players.host === playerId) {
        return 'host';
    }
    if (room.players.guest === playerId) {
        return 'guest';
    }
    return null;
}

function roomSnapshot(room, role) {
    const otherRole = role === 'host' ? 'guest' : 'host';
    return {
        opponentJoined: room.players[otherRole] !== null,
        opponentName: room.names[otherRole],
        hasSubmitted: Boolean(room.pendingMoves[role]),
        opponentHasSubmitted: Boolean(room.pendingMoves[otherRole]),
        round: room.round,
        lastResult: room.lastResult
    };
}

function winningRole(room) {
    const { host, guest } = room.pendingMoves;
    if (host === guest) {
        return 'draw';
    }
    const hostWins =
        (host === 'rock' && guest === 'scissors') ||
        (host === 'paper' && guest === 'rock') ||
        (host === 'scissors' && guest === 'paper');
    return hostWins ? 'host' : 'guest';
}

async function handleApi(request, response, url) {
    cleanExpiredRooms();

    if (request.method === 'POST' && url.pathname === '/api/rooms') {
        let body;
        try {
            body = await readJson(request);
        } catch (error) {
            sendJson(response, 400, { error: error.message });
            return;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body) || !validPlayerName(body.playerName)) {
            sendJson(response, 400, { error: 'Enter a name of 1 to 24 characters.' });
            return;
        }
        if (rooms.size >= maximumRooms) {
            sendJson(response, 503, { error: 'The server is full right now. Please try again later.' });
            return;
        }
        sendJson(response, 201, createRoom(body.playerName.trim()));
        return;
    }

    const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})\/join$/);
    if (request.method === 'POST' && joinMatch) {
        let body;
        try {
            body = await readJson(request);
        } catch (error) {
            sendJson(response, 400, { error: error.message });
            return;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body) || !validPlayerName(body.playerName)) {
            sendJson(response, 400, { error: 'Enter a name of 1 to 24 characters.' });
            return;
        }
        const room = rooms.get(joinMatch[1]);
        if (!room) {
            sendJson(response, 404, { error: 'Room not found. Check the ID or ask the host to create a new room.' });
            return;
        }
        if (room.players.guest) {
            sendJson(response, 409, { error: 'This room already has two players.' });
            return;
        }

        const playerId = newPlayerId();
        room.players.guest = playerId;
        room.names.guest = body.playerName.trim();
        room.updatedAt = Date.now();
        sendJson(response, 200, { roomId: joinMatch[1], playerId, playerName: room.names.guest });
        return;
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})$/);
    if (roomMatch) {
        const room = rooms.get(roomMatch[1]);
        if (!room) {
            sendJson(response, 404, { error: 'Room not found. It may have expired or the server may have restarted.' });
            return;
        }

        const playerId = url.searchParams.get('playerId');
        const role = playerId ? roleForPlayer(room, playerId) : null;
        if (!role) {
            sendJson(response, 403, { error: 'This player ID is not part of the room.' });
            return;
        }

        if (request.method === 'GET') {
            room.updatedAt = Date.now();
            sendJson(response, 200, roomSnapshot(room, role));
            return;
        }

        if (request.method === 'POST') {
            let body;
            try {
                body = await readJson(request);
            } catch (error) {
                sendJson(response, 400, { error: error.message });
                return;
            }
            if (!body || typeof body !== 'object' || Array.isArray(body) || !moveNames.has(body.move)) {
                sendJson(response, 400, { error: 'Choose rock, paper, or scissors.' });
                return;
            }
            if (!room.players.guest) {
                sendJson(response, 409, { error: 'Waiting for another player to join this room.' });
                return;
            }
            if (room.pendingMoves[role]) {
                sendJson(response, 409, { error: 'Your move is already locked in for this round.' });
                return;
            }

            room.pendingMoves[role] = body.move;
            room.updatedAt = Date.now();
            if (room.pendingMoves.host && room.pendingMoves.guest) {
                room.round += 1;
                room.lastResult = {
                    round: room.round,
                    winner: winningRole(room),
                    moves: { ...room.pendingMoves }
                };
                room.pendingMoves = {};
            }
            sendJson(response, 200, roomSnapshot(room, role));
            return;
        }
    }

    sendJson(response, 404, { error: 'API endpoint not found.' });
}

function serveStatic(request, response, url) {
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch (error) {
        sendJson(response, 400, { error: 'Invalid URL path.' });
        return;
    }

    const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!publicFiles.has(requestedPath)) {
        sendJson(response, 404, { error: 'File not found.' });
        return;
    }
    const filePath = path.resolve(publicDirectory, requestedPath);
    if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${path.sep}`)) {
        sendJson(response, 403, { error: 'Forbidden.' });
        return;
    }

    fs.readFile(filePath, (error, contents) => {
        if (error) {
            sendJson(response, error.code === 'ENOENT' ? 404 : 500, {
                error: error.code === 'ENOENT' ? 'File not found.' : 'Could not read the requested file.'
            });
            return;
        }
        response.writeHead(200, {
            'Cache-Control': 'no-cache',
            'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(contents);
    });
}

const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
        handleApi(request, response, url).catch((error) => {
            console.error('Room request failed:', error);
            if (!response.headersSent) {
                sendJson(response, 500, { error: 'The game server encountered an unexpected error.' });
            }
        });
        return;
    }
    if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
    }
    serveStatic(request, response, url);
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Rock Paper Scissors is running at http://localhost:${port}`);
    console.log('For online play, deploy this server or share its reachable address.');
});
