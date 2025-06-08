const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./db");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff");
const productRoutes = require("./routes/products");
const dashboardRoutes = require("./routes/dashboard");
const transactionRoutes = require("./routes/transactions");
const editProductRoutes = require("./routes/editProduct");
const staffTransactionRoutes = require("./routes/staffTransaction");
const activityRoutes = require("./routes/activity");
const userRoutes = require("./routes/users");
const analyticsRoutes = require("./routes/analytics");
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/products", productRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/edit-product", editProductRoutes);
app.use("/api/staff-transaction", staffTransactionRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/analytics", analyticsRoutes);

const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("[Server] User connected:", socket.id);

  socket.on("join", async (userData) => {
    try {
      const { id, role } = userData;
      if (!id || !role) {
        console.error("[Server] Invalid user data:", userData);
        socket.emit("error", { message: "Invalid user ID or role" });
        return;
      }
      socket.user = { id: id.toString(), role };
      socket.join(socket.user.id);
      connectedUsers.set(socket.user.id, { socketId: socket.id, role });
      console.log(`[Server] ${role} ${socket.user.id} joined`);

      // Fetch user list
      const [users] = await db.promise().query(
        "SELECT id, role, name FROM users WHERE role IN (?, ?) AND id != ?",
        [role === "admin" ? "staff" : "admin", role, socket.user.id]
      );
      const allUsers = users.map((user) => ({
        id: user.id.toString(),
        role: user.role,
        name: user.name,
        online: connectedUsers.has(user.id.toString()),
      }));
      io.emit("updateUsers", allUsers);
      console.log("[Server] Emitted updateUsers:", allUsers);

      // Fetch recent conversations
      const [conversations] = await db.promise().query(
        `SELECT u.id, u.name, u.role, c.last_message_time, c.last_message,
          CASE WHEN c.user1 = ? THEN c.unread_count_user1 ELSE c.unread_count_user2 END AS unread_count
         FROM conversations c
         JOIN users u ON u.id = CASE WHEN c.user1 = ? THEN c.user2 ELSE c.user1 END
         WHERE c.user1 = ? OR c.user2 = ?
         ORDER BY c.last_message_time DESC
         LIMIT 10`,
        [socket.user.id, socket.user.id, socket.user.id, socket.user.id]
      );
      const formattedConversations = conversations.map((c) => ({
        id: c.id.toString(),
        name: c.name,
        role: c.role,
        last_message_time: c.last_message_time ? new Date(c.last_message_time).toISOString() : null,
        last_message: c.last_message,
        unread_count: c.unread_count || 0,
      }));
      socket.emit("recentConversations", formattedConversations);
      console.log("[Server] Emitted recentConversations:", formattedConversations);

      // Send pending unread messages
      const [pending] = await db.promise().query(
        "SELECT from_id, to_id, text, timestamp, `read`, type FROM chat_messages WHERE to_id = ? AND `read` = FALSE ORDER BY timestamp ASC",
        [socket.user.id]
      );
      pending.forEach((msg) => {
        socket.emit("receiveMessage", {
          from: { id: msg.from_id.toString(), role: connectedUsers.get(msg.from_id.toString())?.role || "unknown" },
          to: msg.to_id.toString(),
          text: msg.text,
          timestamp: new Date(msg.timestamp).toISOString(),
          read: !!msg.read,
          type: msg.type,
        });
      });
    } catch (error) {
      console.error("[Server] Error in join:", error.message);
      socket.emit("error", { message: "Failed to join chat: " + error.message });
    }
  });

  socket.on("fetchMessages", async ({ otherUserId }, callback) => {
    try {
      if (!socket.user) {
        console.error("[Server] User not authenticated for fetchMessages:", socket.id);
        callback({ error: "User not authenticated" });
        return;
      }
      const { id } = socket.user;
      console.log("[Server] Fetching messages for:", { userId: id, otherUserId });
      const [messages] = await db.promise().query(
        "SELECT from_id, to_id, text, timestamp, `read`, type FROM chat_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY timestamp ASC LIMIT 50",
        [id, otherUserId, otherUserId, id]
      );
      const formattedMessages = messages.map((msg) => ({
        from: { id: msg.from_id.toString(), role: connectedUsers.get(msg.from_id.toString())?.role || "unknown" },
        to: msg.to_id.toString(),
        text: msg.text,
        timestamp: new Date(msg.timestamp).toISOString(),
        read: !!msg.read,
        type: msg.type,
      }));
      console.log("[Server] Fetched messages:", formattedMessages);
      callback(formattedMessages);

      const [result] = await db.promise().query(
        "UPDATE chat_messages SET `read` = TRUE WHERE to_id = ? AND from_id = ? AND `read` = FALSE",
        [id, otherUserId]
      );
      if (result.affectedRows > 0) {
        const [updatedMessages] = await db.promise().query(
          "SELECT timestamp, from_id FROM chat_messages WHERE to_id = ? AND from_id = ? AND `read` = TRUE",
          [id, otherUserId]
        );
        updatedMessages.forEach((msg) => {
          io.to(msg.from_id.toString()).emit("messageUpdated", {
            messageId: new Date(msg.timestamp).toISOString(),
            read: true,
          });
        });
        console.log(`[Server] Marked ${result.affectedRows} messages as read for ${id} from ${otherUserId}`);
      }
    } catch (error) {
      console.error("[Server] Error in fetchMessages:", error.message);
      callback({ error: "Failed to fetch messages: " + error.message });
    }
  });

  socket.on("sendMessage", async ({ to, text }) => {
    try {
      if (!socket.user) {
        console.error("[Server] User not authenticated for sendMessage:", socket.id);
        socket.emit("error", { message: "User not authenticated" });
        return;
      }
      const { id, role } = socket.user;
      if (!to || !text) {
        console.error("[Server] Invalid message data:", { to, text });
        socket.emit("error", { message: "Invalid message data" });
        return;
      }
      const timestamp = new Date().toISOString();
      await db.promise().query(
        "INSERT INTO chat_messages (from_id, to_id, text, timestamp, `read`, type) VALUES (?, ?, ?, ?, FALSE, 'text')",
        [id, to, text, timestamp]
      );
      const message = {
        from: { id, role },
        to,
        text,
        timestamp,
        read: false,
        type: "text",
      };
      io.to(to).emit("receiveMessage", message);
      io.to(id).emit("receiveMessage", message);
      console.log(`[Server] Message from ${id} to ${to}:`, message);
    } catch (error) {
      console.error("[Server] Error in sendMessage:", error.message);
      socket.emit("error", { message: "Failed to send message: " + error.message });
    }
  });

  socket.on("typing", ({ to }) => {
    try {
      if (!socket.user) {
        console.error("[Server] User not authenticated for typing:", socket.id);
        return;
      }
      console.log("[Server] Typing from:", socket.user.id, "to:", to);
      io.to(to).emit("typing", { from: socket.user.id });
    } catch (error) {
      console.error("[Server] Error in typing:", error.message);
    }
  });

  socket.on("stopTyping", ({ to }) => {
    try {
      if (!socket.user) {
        console.error("[Server] User not authenticated for stopTyping:", socket.id);
        return;
      }
      console.log("[Server] Stop typing from:", socket.user.id, "to:", to);
      io.to(to).emit("stopTyping", { from: socket.user.id });
    } catch (error) {
      console.error("[Server] Error in stopTyping:", error.message);
    }
  });

  socket.on("messageRead", async (messageId) => {
    try {
      if (!socket.user) {
        console.error("[Server] User not authenticated for messageRead:", socket.id);
        socket.emit("error", { message: "User not authenticated" });
        return;
      }
      const { id } = socket.user;
      console.log("[Server] Marking message read:", { messageId, userId: id });
      const [result] = await db.promise().query(
        "UPDATE chat_messages SET `read` = TRUE WHERE timestamp = ? AND to_id = ? AND `read` = FALSE",
        [messageId, id]
      );
      if (result.affectedRows > 0) {
        const [msg] = await db.promise().query(
          "SELECT from_id FROM chat_messages WHERE timestamp = ?",
          [messageId]
        );
        io.to(msg[0].from_id.toString()).emit("messageUpdated", { messageId, read: true });
        console.log(`[Server] Message ${messageId} read by ${id}`);
      }
    } catch (error) {
      console.error("[Server] Error in messageRead:", error.message);
      socket.emit("error", { message: "Failed to mark message as read: " + error.message });
    }
  });

  socket.on("disconnect", async () => {
    try {
      if (!socket.user) {
        console.log("[Server] Unauthenticated user disconnected:", socket.id);
        return;
      }
      const userId = socket.user.id;
      connectedUsers.delete(userId);
      const [users] = await db.promise().query("SELECT id, role, name FROM users");
      const allUsers = users.map((user) => ({
        id: user.id.toString(),
        role: user.role,
        name: user.name,
        online: connectedUsers.has(user.id.toString()),
      }));
      io.emit("updateUsers", allUsers);
      console.log(`[Server] User ${userId} disconnected`);
    } catch (error) {
      console.error("[Server] Error in disconnect:", error.message);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));