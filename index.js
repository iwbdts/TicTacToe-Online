var http = require("http");
var socket = require("socket.io");
var express = require("express");
var app = express();
app.set("view engine", "ejs");
app.set("views", "./views");
var server = http.createServer(app);
var io = socket(server);
var users = {};
var rooms = {};
var defaultGameState = ["", "", "", "", "", "", "", "", ""];

// app.use(express.urlencoded({ extended: true }));

app.get("/", function (req, res) {
    res.render("index");
});

app.get("/rooms", (req, res) => {
    const nickname = req.query.nickname;
    res.render("rooms", { nickname });
});

app.get("/game/:roomId", (req, res) => {
    const roomId = req.params.roomId;
    const nickname = req.query.nickname;
    res.render("game", { roomId, nickname });
});

function findUserBySocketId(socketId) {
    for (let nickname in users) {
        if (users.hasOwnProperty(nickname) && users[nickname].id === socketId) {
            // console.log("foundUserBySocketId: ", nickname);
            return nickname;
        }
    }
}

function updateRooms() {

    for (let roomId in rooms) {
        let room = rooms[roomId];
        let p1 = room.player1;
        let p2 = room.player2;
        if (p1 !== undefined && !users.hasOwnProperty(p1)) {
            console.log("updateRooms: player", p1, "not in users - deleting from game, game state to default");
            p1 = undefined;
            rooms[roomId].gameState = defaultGameState.slice();
            io.to(room).emit("updateGameBoard", { gameState: defaultGameState.slice(), figure: "O" });
        }
        if (p2 !== undefined && !users.hasOwnProperty(p2)) {
            p2 = undefined;
            rooms[roomId].gameState = defaultGameState.slice();
            io.to(room).emit("updateGameBoard", { gameState: defaultGameState.slice(), figure: "O" });
        }
        if (p1 === undefined) {
            if (p2 === undefined) {
                delete rooms[roomId];
            } else {
                room.player1 = p2;
                room.player2 = undefined;
                rooms[roomId].gameState = defaultGameState.slice();
                io.to(room).emit("updateGameBoard", { gameState: rooms[roomId].gameState, figure: "O" });
            }
        }
    }
    io.emit("updateRoomsList", Object.values(rooms));
    // console.log("Updated rooms:", rooms);

}

function checkWinner(gameState) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (let combo of winningCombinations) {
        if (gameState[combo[0]] !== "" &&
            gameState[combo[0]] === gameState[combo[1]] &&
            gameState[combo[1]] === gameState[combo[2]]) {
            // console.log("The winner is ", gameState[combo[0]]);
            return gameState[combo[0]];
        }
    }
    return null;
}

function checkGameOver(gameState) {
    var availableMoves = false;
    gameState.forEach(element => {
        if (element == "") {
            availableMoves = true;
        }
    });
    if (availableMoves) {
        if (checkWinner(gameState)) {
            return true;
        }
        return false;
    } else {
        return true;
    }
}

io.on("connection", (socket) => {
    let id = socket.id;
    // console.log("client connected:" + id);
    updateRooms();

    socket.on("checkNickname", (nickname) => {
        // check if nickname is unique
        let isTaken = users.hasOwnProperty(nickname);
        // console.log("Is nickname", nickname, "taken?", isTaken);
        socket.emit("checkNicknameResult", isTaken);
    });

    socket.on("setNickname", (nickname) => {
        // set nickname and add it to users
        users[nickname] = {
            nickname: nickname,
            id: id,
            roomId: undefined,
        };
        // console.log("Setting nickname to", nickname);
        io.emit("updateUsers", Object.values(users));
    });

    socket.on("updateUsersId", (data) => {
        // update user socketid when going between pages
        users[data.nickname] = {
            nickname: data.nickname,
            id: id,
            roomId: undefined,
        };
        // console.log("User ", data.nickname, "id updated to ", id);
        io.emit("updateUsers", Object.values(users));
    });

    socket.on("updateUsersRoom", (data) => {
        users[data.nickname].roomId = data.roomId;
        socket.join(data.roomId);
        rooms[data.roomId].gameState = defaultGameState.slice();
        console.log("User ", data.nickname, "room updated to ", data.roomId);
        io.emit("updateUsers", Object.values(users));
    });

    socket.on("getFigure", (data) => {
        // set figure to X or O in game
        var roomId = data.roomId;
        var player = data.player;

        if (rooms[roomId].player1 == player) {
            // console.log("User ", player, "'s figure is O");
            socket.emit("getFigureResult", "O");
        }
        if (rooms[roomId].player2 == player) {
            // console.log("User ", player, "'s figure is X");
            socket.emit("getFigureResult", "X");
        }
    });

    socket.on("getPlayers", (roomId) => {
        // set game players
        if (rooms.hasOwnProperty(roomId)) {
            var p1 = rooms[roomId].player1;
            var p2;
            if (rooms[roomId].player2) {
                p2 = rooms[roomId].player2;
                io.to(roomId).emit("gameOn");
            } else {
                p2 = "...";
                rooms[roomId].gameState = defaultGameState.slice();
            }
            // console.log("Get players: ", p1, p2);
            io.to(roomId).emit("getPlayersResult", { p1: p1, p2: p2 });
        }
    });

    socket.on("createRoom", (gameRoom) => {
        //executed whenever game.ejs loads
        var roomId = gameRoom.roomId;
        if (!rooms.hasOwnProperty(roomId)) {
            // executed when creating the room
            var p1 = gameRoom.player1;
            var p2 = gameRoom.player2;
            var room = {
                roomId: roomId,
                player1: p1,
                player2: p2,
                gameState: defaultGameState.slice(),
            };
            rooms[roomId] = room;
            if (users[p1]) {
                users[p1].roomId = roomId;
            }
            if (users[p2]) {
                users[p2].roomId = roomId;
            }
            updateRooms();
            // console.log("Creating a new room with player ", room.player1);
        } else {
            // executed when joining existing room
            var p1 = rooms[roomId].player1;
            var p2 = rooms[roomId].player2;
            if (p1 && !p2) {
                rooms[roomId].player2 = gameRoom.player1;
            }
        }

        socket.join(roomId);
        // console.log(findUserBySocketId(socket.id), "joined room ", gameRoom.roomId)
        rooms[roomId].gameState = defaultGameState.slice();
        io.to(roomId).emit("updateGameBoard", { gameState: rooms[roomId].gameState, figure: "O" });
    });

    socket.on("updateRooms", () => {
        // called in game.ejs
        // console.log("updating rooms...");
        updateRooms();
    });

    socket.on("checkRoom", (roomId) => {
        // called in rooms.ejs 
        var isFull = false;
        if (rooms.hasOwnProperty(roomId)) {
            var room = rooms[roomId];
            if (room.player1 !== undefined && room.player2 !== undefined) {
                // console.log(
                //     "Both ",
                //     room.player1,
                //     " and ",
                //     room.player2,
                //     " are defined."
                // );
                isFull = true;
            }
        }
        socket.emit("checkRoomResult", { isFull: isFull, roomId: roomId });
    });

    socket.on("joinRoom", (data) => {
        let roomId = data.roomId;
        let player = data.player;

        if (rooms[roomId]) {
            if (rooms[roomId].player1 && rooms[roomId].player2) {
                // console.log("Room ", roomId, "is full", player, "cannot join");
            } else {
                rooms[roomId].player2 = player;
                // console.log(
                //     "Player",
                //     player,
                //     " joined room ",
                //     roomId,
                //     " now playing with ",
                //     rooms[roomId].player1
                // );
                socket.join(roomId);
                updateRooms();
                rooms[roomId].gameState = defaultGameState.slice();
                io.to(roomId).emit("updateGameBoard", { gameState: rooms[roomId].gameState, figure: "O" });
            }

        } else {
            // console.log("Room not found: ", roomId);
        }
    });

    socket.on("playerMove", (data) => {
        var roomId = data.roomId;
        var cellId = +data.cellId;
        var figure = data.figure;
        var player = data.player;
        if (rooms.hasOwnProperty(roomId) && rooms[roomId].player1 !== undefined && rooms[roomId].player2 !== undefined) {
            // console.log("Player1 and 2 are defined here:", rooms[roomId]);
            if (rooms[roomId].gameState[cellId] === "") {
                rooms[roomId].gameState[cellId] = figure;
                var nextFigure = figure === "X" ? "O" : "X";
                // console.log(player, "made move in room", roomId);
                io.to(roomId).emit("updateGameBoard", { gameState: rooms[roomId].gameState, figure: nextFigure });
                if (checkGameOver(rooms[roomId].gameState)) {
                    // console.log("EMITTING GAME OVER- WINNER IS", checkWinner(rooms[roomId].gameState));
                    io.to(roomId).emit("gameOver", (checkWinner(rooms[roomId].gameState)));
                }
            } else {
                // console.log("Illegal move attempted in room", roomId);
            }

        } else {
            // console.log("Room not found:", roomId);
        }
    });

    socket.on("clearBoard", (roomId) => {
        // console.log("restart game in room", roomId);
        if (rooms.hasOwnProperty(roomId)) {
            rooms[roomId].gameState = defaultGameState.slice();
            io.to(roomId).emit("updateGameBoard", { gameState: rooms[roomId].gameState, figure: "O" });

        }
    });

    socket.on("leaveRoom", (data) => {
        if (rooms[data.roomId].player1 == data.user) {
            rooms[data.roomId].player1 = undefined;
        } else {
            rooms[data.roomId].player2 = undefined;
        }
        console.log("User ", data.user, "left room ", data.roomId);
        updateRooms();
    });

    socket.on("restartGame", roomId => {
        io.to(roomId).emit("restartGameResponse");
    });
    socket.on("disconnect", () => {
        // console.log("client disconnected:" + id);
        var userNickname = findUserBySocketId(id);
        if (
            userNickname &&
            users[userNickname] &&
            users[userNickname].roomId !== undefined
        ) {
            var roomId = users[userNickname].roomId;
            var room = rooms[roomId];

            if (room) {
                if (room.player1 === userNickname) {
                    room.player1 = undefined;
                } else if (room.player2 === userNickname) {
                    room.player2 = undefined;
                }
                console.log("User ", userNickname, "left room ", roomId);
            }
        }
        // console.log("User ", userNickname, "deleted");
        delete users[userNickname];
        io.emit("updateUsers", Object.values(users));
        updateRooms();
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});