const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
const path = require("path");

// Middleware
app.use(compression());
app.use(helmet());
app.use(morgan("combined"));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

// Connect to MongoDB
let isConnected = false;
const connectToDatabase = async () => {
  if (isConnected) {
    return;
  }
  try {
    const db = await mongoose.connect(process.env.DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = db.connections[0].readyState;
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    console.error("Error connecting to MongoDB Atlas:", err);
    throw err;
  }
};

app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    res.status(500).send("Database connection error");
  }
});

// Schemas and Models
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
});

const itemSchema = new mongoose.Schema({
  name: String,
  user: String,
});

const User = mongoose.model("User", userSchema);
const Item = mongoose.model("Item", itemSchema);

const defaultItems = [
  { name: "Welcome to your ToDo List!" },
  { name: "Hit + to add a new item." },
  { name: "<-- Check this to delete an item." },
];

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
};

// Routes
app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect(`/lists/${req.session.user.username}`);
  }
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && (await bcrypt.compare(password, user.password))) {
      req.session.user = user; // Сохраняем пользователя в сессии
      return res.redirect(`/lists/${username}`);
    }
    res.render("login", { error: "Invalid username or password." });
  } catch (err) {
    console.error(err);
    res.redirect("/login");
  }
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.render("register", { error: "Username already exists." });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/profile/:username", isAuthenticated, (req, res) => {
  const { username } = req.params;
  if (username !== req.session.user.username) {
    return res.redirect("/login");
  }
  res.render("profile", { user: req.session.user });
});

app.post("/profile/:username", isAuthenticated, async (req, res) => {
  const { username } = req.params;
  const { newUsername, newPassword } = req.body;

  if (username !== req.session.user.username) {
    return res.redirect("/login");
  }

  try {
    if (newUsername) {
      req.session.user.username = newUsername;
      await User.findByIdAndUpdate(req.session.user._id, { username: newUsername });
    }
    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await User.findByIdAndUpdate(req.session.user._id, { password: hashedPassword });
    }
    res.redirect(`/profile/${req.session.user.username}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/profile/${username}`);
  }
});

app.get("/lists/:username", isAuthenticated, async (req, res) => {
  const { username } = req.params;
  if (username !== req.session.user.username) {
    return res.redirect("/login");
  }

  try {
    let foundItems = await Item.find({ user: username });
    if (foundItems.length === 0) {
      const userDefaultItems = defaultItems.map((item) => ({ ...item, user: username }));
      await Item.insertMany(userDefaultItems);
      foundItems = userDefaultItems;
    }

    res.render("list", {
      listTitle: "Today",
      newListItems: foundItems,
      user: req.session.user,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/login");
  }
});

app.post("/lists", isAuthenticated, async (req, res) => {
  const { newItem } = req.body;
  const item = new Item({ name: newItem, user: req.session.user.username });
  try {
    await item.save();
    res.redirect(`/lists/${req.session.user.username}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/lists/${req.session.user.username}`);
  }
});

app.post("/delete", isAuthenticated, async (req, res) => {
  const { checkbox } = req.body;
  try {
    await Item.findByIdAndDelete(checkbox);
    res.redirect(`/lists/${req.session.user.username}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/lists/${req.session.user.username}`);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
