import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT) || 3002;
const ORIGIN = process.env.CORS_ORIGIN || "*";

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("edraw-room");
});

const io = new Server(httpServer, {
  cors: { origin: ORIGIN, methods: ["GET", "POST"] },
  // Keep-alive friendly defaults for Fly proxy
  pingInterval: 20000,
  pingTimeout: 25000,
});

io.on("connection", (socket) => {
  let joinedRoom = null;
  let user = null;

  socket.on("join-room", ({ room, user: u }) => {
    if (typeof room !== "string" || !room) return;
    joinedRoom = room;
    user = u || { id: socket.id };
    socket.join(room);
    socket.to(room).emit("user-joined", { from: socket.id, user });
    const size = io.sockets.adapter.rooms.get(room)?.size || 1;
    socket.emit("joined", { room, peers: size - 1 });
  });

  socket.on("scene-update", ({ room, elements }) => {
    if (!room || room !== joinedRoom) return;
    socket.to(room).emit("scene-update", { from: socket.id, elements });
  });

  socket.on("pointer-update", ({ room, user: u, pointer, button }) => {
    if (!room || room !== joinedRoom) return;
    socket.to(room).emit("pointer-update", {
      from: socket.id,
      user: u || user,
      pointer,
      button,
    });
  });

  socket.on("disconnect", () => {
    if (joinedRoom) {
      socket.to(joinedRoom).emit("user-left", { from: socket.id, user });
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`edraw-room listening on :${PORT}`);
});
