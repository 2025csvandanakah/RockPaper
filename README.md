# Playroom Rock Paper Scissors

## Run the game

Install Node.js 18 or later, open a terminal in this folder, and run:

```sh
npm start
```

Open `http://localhost:3000`. The home screen asks for your name and an optional room ID. Enter a room ID to join that game, or leave the room ID blank to create a new room and receive one to share. You can also choose computer play or two-player play on one device. Same-device players use a shared countdown and simultaneous ten-second input window: Player 1 presses A/S/D for rock/paper/scissors, and Player 2 presses J/K/L. Move buttons are also available beneath each player's keys. The game only shows that a move is locked in, never which move; choices are revealed when the window closes. If either player misses the window, the round is cancelled without awarding a point.

## Online rooms

The host enters a name and leaves the room ID blank to create a room, then shares the six-character room ID (or copied invite link). The other player enters their name and the host's room ID on the home screen. Player names appear in the room, and moves stay hidden until both players have chosen.

For two devices on the same network, the host can share the server computer's reachable network address instead of `localhost`; the firewall must allow the configured port. To play over the internet, deploy this Node.js server to a publicly reachable host, use HTTPS (for example, through a TLS-enabled reverse proxy), and share that URL. Rooms are stored in server memory and expire after two hours of inactivity; restarting the server clears active rooms.
