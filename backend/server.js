const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./db"); // Use the connection object
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
const recentConversationsMap = new Map(); // Track recent conversation partners per user

io.on("connection", (socket) => {
  console.log("[Server] User connected:", socket.id);

  socket.on("join", (userData, callback) => {
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

    db.query("SELECT id, role, name FROM users", (err, allUsersResult) => {
      if (err) {
        console.error("[Server] Error fetching all users:", err);
        socket.emit("error", { message: "Failed to fetch users: " + err.message });
        return;
      }
      console.log("[Server] All users in DB:", allUsersResult);

      db.query("SELECT id, role, name FROM users WHERE id != ?", [socket.user.id], (err, users) => {
        if (err) {
          console.error("[Server] Error fetching users:", err);
          socket.emit("error", { message: "Failed to fetch users: " + err.message });
          return;
        }
        if (!users || users.length === 0) {
          console.warn("[Server] No other users found for id:", socket.user.id);
        }
        const allUsers = users.map((user) => ({
          id: user.id.toString(),
          role: user.role,
          name: user.name || `User ${user.id}`, // Ensure name is always set
          online: connectedUsers.has(user.id.toString()),
        }));
        console.log("[Server] Emitted updateUsers:", allUsers);
        io.emit("updateUsers", allUsers);

        db.query(
          `SELECT u.id, u.name, u.role, c.last_message_time, c.last_message,
            COALESCE(
              CASE WHEN c.user1 = ? THEN c.unread_count_user1 ELSE c.unread_count_user2 END, 0
            ) AS unread_count
           FROM conversations c
           JOIN users u ON u.id = CASE WHEN c.user1 = ? THEN c.user2 ELSE c.user1 END
           WHERE c.user1 = ? OR c.user2 = ?
           ORDER BY c.last_message_time DESC
           LIMIT 10`,
          [socket.user.id, socket.user.id, socket.user.id, socket.user.id],
          (err, conversations) => {
            if (err) {
              console.error("[Server] Error fetching conversations:", err);
              socket.emit("error", { message: "Failed to fetch conversations: " + err.message });
              return;
            }
            const formattedConversations = conversations.map((c) => ({
              id: c.id.toString(),
              name: c.name || `User ${c.id}`, // Fallback to User ID if name is missing
              role: c.role,
              last_message_time: c.last_message_time ? new Date(c.last_message_time).toISOString() : null,
              last_message: c.last_message,
              unread_count: c.unread_count || 0,
            }));
            socket.emit("updateSidebar", formattedConversations); // Changed to updateSidebar
            console.log("[Server] Emitted updateSidebar:", formattedConversations);

            db.query(
              "SELECT from_id, to_id, text, timestamp, `read`, type FROM chat_messages WHERE to_id = ? AND `read` = FALSE ORDER BY timestamp ASC",
              [socket.user.id],
              (err, pending) => {
                if (err) {
                  console.error("[Server] Error fetching pending messages:", err);
                  socket.emit("error", { message: "Failed to fetch pending messages: " + err.message });
                  return;
                }
                if (pending) {
                  pending.forEach((msg) => {
                    socket.emit("receiveMessage", {
                      from: { id: msg.from_id.toString(), role: connectedUsers.get(msg.from_id.toString())?.role || "unknown", name: allUsers.find(u => u.id === msg.from_id.toString())?.name || `User ${msg.from_id}` },
                      to: msg.to_id.toString(),
                      text: msg.text,
                      timestamp: new Date(msg.timestamp).toISOString(),
                      read: !!msg.read,
                      type: msg.type,
                      direction: msg.from_id.toString() === socket.user.id ? "right" : "left",
                    });
                  });
                }
                if (callback) callback();
              }
            );
          }
        );
      });
    });
  });

  socket.on("fetchMessages", ({ otherUserId }, callback) => {
    if (!socket.user) {
      console.error("[Server] User not authenticated for fetchMessages:", socket.id);
      if (typeof callback === "function") callback({ error: "User not authenticated" });
      return;
    }
    const { id } = socket.user;
    console.log("[Server] Fetching messages for:", { userId: id, otherUserId });
    db.query(
      "SELECT from_id, to_id, text, timestamp, `read`, type FROM chat_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY timestamp ASC LIMIT 50",
      [id, otherUserId, otherUserId, id],
      (err, messages) => {
        if (err) {
          console.error("[Server] Error fetching messages:", err);
          if (typeof callback === "function") callback({ error: "Failed to fetch messages: " + err.message });
          return;
        }
        const allUsers = connectedUsers.size > 0 ? Array.from(connectedUsers.entries()).map(([uid, data]) => ({ id: uid, role: data.role })) : [];
        const formattedMessages = messages.map((msg) => ({
          from: { id: msg.from_id.toString(), role: connectedUsers.get(msg.from_id.toString())?.role || "unknown", name: allUsers.find(u => u.id === msg.from_id.toString())?.name || `User ${msg.from_id}` },
          to: msg.to_id.toString(),
          text: msg.text,
          timestamp: new Date(msg.timestamp).toISOString(),
          read: !!msg.read,
          type: msg.type,
          direction: msg.from_id.toString() === id ? "right" : "left",
        }));
        console.log("[Server] Fetched messages:", formattedMessages);
        if (typeof callback === "function") callback(formattedMessages);

        db.query(
          "UPDATE chat_messages SET `read` = TRUE WHERE to_id = ? AND from_id = ? AND `read` = FALSE",
          [id, otherUserId],
          (err, result) => {
            if (err) {
              console.error("[Server] Error updating read status:", err);
              return;
            }
            if (result.affectedRows > 0) {
              db.query(
                "SELECT timestamp, from_id FROM chat_messages WHERE to_id = ? AND from_id = ? AND `read` = TRUE",
                [id, otherUserId],
                (err, updatedMessages) => {
                  if (err) {
                    console.error("[Server] Error fetching updated messages:", err);
                    return;
                  }
                  updatedMessages.forEach((msg) => {
                    io.to(msg.from_id.toString()).emit("messageUpdated", {
                      messageId: new Date(msg.timestamp).toISOString(),
                      read: true,
                    });
                  });
                  console.log(`[Server] Marked ${result.affectedRows} messages as read for ${id} from ${otherUserId}`);
                }
              );
            }
          }
        );
      }
    );
  });

  socket.on("sendMessage", ({ to, text }, callback) => {
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
    db.query(
      "INSERT INTO chat_messages (from_id, to_id, text, timestamp, `read`, type) VALUES (?, ?, ?, ?, FALSE, 'text')",
      [id, to, text, timestamp],
      (err) => {
        if (err) {
          console.error("[Server] Error sending message:", err);
          socket.emit("error", { message: "Failed to send message: " + err.message });
          return;
        }
        db.query("SELECT name FROM users WHERE id = ?", [id], (err, result) => {
          const senderName = result[0]?.name || `User ${id}`;
          const message = {
            from: { id, role, name: senderName },
            to,
            text,
            timestamp,
            read: false,
            type: "text",
            direction: "right", // Sender's message
          };
          io.to(to).emit("receiveMessage", message); // Send to recipient
          socket.emit("receiveMessage", message); // Send to sender
          console.log(`[Server] Message from ${id} to ${to}:`, message);

          // Update conversations table with unread count
          db.query(
            `INSERT INTO conversations (user1, user2, last_message_time, last_message, unread_count_user1, unread_count_user2)
             VALUES (?, ?, ?, ?, 0, 1)
             ON DUPLICATE KEY UPDATE
             last_message_time = VALUES(last_message_time),
             last_message = VALUES(last_message),
             unread_count_user2 = unread_count_user2 + 1`,
            [id, to, timestamp, text],
            (err) => {
              if (err) console.error("[Server] Error updating conversations:", err);
            }
          );

          // Update recent conversations
          let recent = recentConversationsMap.get(id) || [];
          if (!recent.some(user => user.id === to)) {
            db.query("SELECT id, name FROM users WHERE id = ?", [to], (err, result) => {
              if (err || !result.length) return;
              recent.unshift({ id: to, name: result[0].name || `User ${to}` });
              recent = recent.slice(0, 10); // Limit to 10 recent users
              recentConversationsMap.set(id, recent);
              io.to(id).emit("updateSidebar", recent);
            });
          } else {
            recent = recent.filter(user => user.id !== to);
            recent.unshift({ id: to, name: (recent.find(u => u.id === to) || {}).name || `User ${to}` });
            recentConversationsMap.set(id, recent);
            io.to(id).emit("updateSidebar", recent);
          }
          if (callback) callback();
        });
      }
    );
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

  socket.on("messageRead", (messageId) => {
    if (!socket.user) {
      console.error("[Server] User not authenticated for messageRead:", socket.id);
      socket.emit("error", { message: "User not authenticated" });
      return;
    }
    const { id } = socket.user;
    console.log("[Server] Marking message read:", { messageId, userId: id });
    db.query(
      "UPDATE chat_messages SET `read` = TRUE WHERE timestamp = ? AND to_id = ? AND `read` = FALSE",
      [messageId, id],
      (err, result) => {
        if (err) {
          console.error("[Server] Error marking message read:", err);
          socket.emit("error", { message: "Failed to mark message as read: " + err.message });
          return;
        }
        if (result.affectedRows > 0) {
          db.query(
            "SELECT from_id FROM chat_messages WHERE timestamp = ?",
            [messageId],
            (err, msg) => {
              if (err) {
                console.error("[Server] Error fetching from_id:", err);
                return;
              }
              const fromId = msg[0].from_id.toString();
              io.to(fromId).emit("messageUpdated", { messageId, read: true });

              // Update unread count in conversations
              db.query(
                `UPDATE conversations
                 SET unread_count_user1 = CASE WHEN user1 = ? THEN 0 ELSE unread_count_user1 END,
                     unread_count_user2 = CASE WHEN user2 = ? THEN 0 ELSE unread_count_user2 END
                 WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)`,
                [id, id, id, fromId, fromId, id],
                (err) => {
                  if (err) console.error("[Server] Error updating unread count:", err);
                  else io.to(id).emit("updateSidebar", recentConversationsMap.get(id) || []);
                }
              );
            }
          );
        }
      }
    );
  });

  socket.on("disconnect", () => {
    if (!socket.user) {
      console.log("[Server] Unauthenticated user disconnected:", socket.id);
      return;
    }
    const userId = socket.user.id;
    connectedUsers.delete(userId);

    db.query("SELECT id, role, name FROM users", (err, users) => {
      if (err) {
        console.error("[Server] Error fetching users on disconnect:", err);
        return;
      }
      if (!users || users.length === 0) {
        console.warn("[Server] No users found in DB during disconnect");
      }
      const allUsers = users.map((user) => ({
        id: user.id.toString(),
        role: user.role,
        name: user.name || `User ${user.id}`,
        online: connectedUsers.has(user.id.toString()),
      }));
      io.emit("updateUsers", allUsers);
      console.log(`[Server] User ${userId} disconnected`);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));