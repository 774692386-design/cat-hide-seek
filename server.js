const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const WORLD = 13;
const ROUND_SECONDS = 90;
const PROPS = [
  { id: "box", type: "纸箱", x: -4.2, z: -2.8, color: 0xb98755, radius: 1.0 },
  { id: "plant", type: "盆栽", x: 3.8, z: -3.4, color: 0x58a66a, radius: 0.9 },
  { id: "toy", type: "玩具", x: -3.7, z: 3.7, color: 0xe88aaf, radius: 0.8 },
  { id: "barrel", type: "圆桶", x: 4.1, z: 3.6, color: 0x6699cc, radius: 0.9 },
  { id: "sofa", type: "沙发", x: 0, z: -5.0, color: 0x9b83c8, radius: 1.5 },
  { id: "lamp", type: "落地灯", x: 0, z: 5.0, color: 0xe7c86d, radius: 0.7 }
];

function code() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function cleanName(value) {
  return String(value || "小猫").trim().replace(/[<>]/g, "").slice(0, 12) || "小猫";
}
function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    timeLeft: room.timeLeft,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, z: p.z, yaw: p.yaw,
      form: p.form, alive: p.alive, score: p.score, ready: p.ready,
      isHost: p.id === room.host
    })),
    dog: room.dog,
    props: PROPS
  };
}
function emitRoom(room) {
  io.to(room.code).emit("state", publicRoom(room));
}
function makeRoom(host) {
  let roomCode;
  do { roomCode = code(); } while (rooms.has(roomCode));
  const room = {
    code: roomCode, host, phase: "lobby", timeLeft: ROUND_SECONDS,
    players: new Map(),
    dog: { x: 0, z: 0, yaw: 0, target: null },
    interval: null, lastTick: Date.now()
  };
  rooms.set(roomCode, room);
  return room;
}
function stopRound(room) {
  if (room.interval) clearInterval(room.interval);
  room.interval = null;
}
function startRound(room) {
  if (room.players.size < 1) return;
  stopRound(room);
  room.phase = "playing";
  room.timeLeft = ROUND_SECONDS;
  room.dog = { x: 0, z: 0, yaw: 0, target: null };
  for (const p of room.players.values()) {
    p.x = (Math.random() - 0.5) * 8;
    p.z = (Math.random() - 0.5) * 8;
    p.alive = true; p.form = "cat"; p.score = 0;
  }
  room.lastTick = Date.now();
  room.interval = setInterval(() => {
    if (room.phase !== "playing") return;
    const now = Date.now();
    const dt = Math.min(0.12, (now - room.lastTick) / 1000);
    room.lastTick = now;
    room.timeLeft = Math.max(0, room.timeLeft - dt);

    const alive = [...room.players.values()].filter(p => p.alive);
    if (alive.length) {
      let target = alive.reduce((best, p) => {
        const d = Math.hypot(p.x - room.dog.x, p.z - room.dog.z);
        return !best || d < best.d ? { p, d } : best;
      }, null);
      if (target) {
        const dx = target.p.x - room.dog.x, dz = target.p.z - room.dog.z;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        room.dog.yaw = Math.atan2(dx, dz);
        const speed = 2.0;
        if (d > 0.7) {
          room.dog.x += dx / d * speed * dt;
          room.dog.z += dz / d * speed * dt;
        }
        if (d < 0.95 && target.p.form === "cat") {
          target.p.alive = false;
          io.to(room.code).emit("caught", { name: target.p.name });
        }
      }
    }
    room.dog.x = Math.max(-WORLD, Math.min(WORLD, room.dog.x));
    room.dog.z = Math.max(-WORLD, Math.min(WORLD, room.dog.z));

    if (room.timeLeft <= 0 || alive.length === 0) {
      room.phase = "ended";
      for (const p of room.players.values()) if (p.alive) p.score += 100;
      stopRound(room);
      io.to(room.code).emit("roundEnd", {
        reason: alive.length ? "time" : "caught",
        winners: [...room.players.values()].filter(p => p.alive).map(p => p.name)
      });
    }
    emitRoom(room);
  }, 100);
  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, ack = () => {}) => {
    const room = makeRoom(socket.id);
    room.players.set(socket.id, {
      id: socket.id, name: cleanName(name), x: 0, z: 0, yaw: 0,
      form: "cat", alive: true, score: 0, ready: true
    });
    socket.join(room.code);
    ack({ ok: true, code: room.code, state: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("joinRoom", ({ code: rawCode, name } = {}, ack = () => {}) => {
    const roomCode = String(rawCode || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return ack({ ok: false, error: "没有找到这个房间，请检查邀请码。" });
    if (room.phase === "playing") return ack({ ok: false, error: "游戏已经开始，暂时不能加入。" });
    if (room.players.size >= 8) return ack({ ok: false, error: "房间已满（最多 8 人）。" });
    room.players.set(socket.id, {
      id: socket.id, name: cleanName(name), x: (Math.random() - .5) * 4,
      z: (Math.random() - .5) * 4, yaw: 0, form: "cat",
      alive: true, score: 0, ready: true
    });
    socket.join(room.code);
    ack({ ok: true, code: room.code, state: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("startRound", ({ code: roomCode } = {}, ack = () => {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if (!room || room.host !== socket.id) return ack?.({ ok: false, error: "只有房主可以开始游戏。" });
    if (room.players.size < 1) return ack?.({ ok: false, error: "房间里还没有玩家。" });
    startRound(room);
    ack?.({ ok: true });
  });

  socket.on("move", ({ code: roomCode, x, z, yaw } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    const p = room?.players.get(socket.id);
    if (!room || room.phase !== "playing" || !p || !p.alive) return;
    if (![x, z, yaw].every(Number.isFinite)) return;
    p.x = Math.max(-WORLD, Math.min(WORLD, x));
    p.z = Math.max(-WORLD, Math.min(WORLD, z));
    p.yaw = yaw;
  });

  socket.on("morph", ({ code: roomCode, form } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    const p = room?.players.get(socket.id);
    if (!room || room.phase !== "playing" || !p || !p.alive) return;
    const allowed = ["cat", ...PROPS.map(v => v.id)];
    if (allowed.includes(form)) p.form = form;
    emitRoom(room);
  });

  socket.on("taunt", ({ code: roomCode } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    const p = room?.players.get(socket.id);
    if (!room || !p || !p.alive || room.phase !== "playing") return;
    io.to(room.code).emit("notice", `${p.name} 发出了喵喵挑衅！`);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      if (room.host === socket.id) room.host = room.players.keys().next().value || null;
      if (!room.players.size) {
        stopRound(room);
        rooms.delete(room.code);
      } else {
        emitRoom(room);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Cat Hide & Seek running on port ${PORT}`));
