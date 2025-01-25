const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const path = require("path");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
// Middleware
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Connect to MongoDB
mongoose
  .connect(process.env.DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("Error connecting to MongoDB Atlas:", err));

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

// Global user storage
let currentUser = null;

// Routes
app.get("/", (req, res) => {
  if (currentUser) {
    return res.redirect(`/lists/${currentUser.username}`);
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
      currentUser = user;
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
  currentUser = null;
  res.redirect("/login");
});

app.get("/profile/:username", (req, res) => {
  const { username } = req.params;
  if (!currentUser || username !== currentUser.username) {
    return res.redirect("/login");
  }
  res.render("profile", { user: currentUser });
});

app.post("/profile/:username", async (req, res) => {
  const { username } = req.params;
  const { newUsername, newPassword, confirmPassword } = req.body;

  if (!currentUser || username !== currentUser.username) {
    return res.redirect("/login");
  }

  // Проверка совпадения паролей
  if (newPassword !== confirmPassword) {
    return res.render("profile", {
      user: currentUser,
      error: "Passwords do not match.",
    });
  }

  try {
    // Изменение имени пользователя, если указано
    if (newUsername && newUsername !== currentUser.username) {
      currentUser.username = newUsername;
    }

    // Изменение пароля, если введен новый
    if (newPassword) {
      currentUser.password = await bcrypt.hash(newPassword, 10);
    }

    await currentUser.save();
    res.redirect(`/profile/${currentUser.username}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/profile/${username}`);
  }
});


app.get("/lists/:username", async (req, res) => {
  if (!currentUser || req.params.username !== currentUser.username) {
    return res.redirect("/login");
  }

  try {
    let foundItems = await Item.find({ user: currentUser.username });
    if (foundItems.length === 0) {
      const userDefaultItems = defaultItems.map((item) => ({ ...item, user: currentUser.username }));
      await Item.insertMany(userDefaultItems);
      foundItems = userDefaultItems;
    }

    res.render("list", {
      listTitle: "Today",
      newListItems: foundItems,
      user: currentUser,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/login");
  }
});

app.post("/lists", async (req, res) => {
  if (!currentUser) return res.redirect("/login");

  const { newItem } = req.body;
  const item = new Item({ name: newItem, user: currentUser.username });
  try {
    await item.save();
    res.redirect(`/lists/${currentUser.username}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/lists/${currentUser.username}`);
  }
});

app.post("/delete", async (req, res) => {
  if (!currentUser) return res.redirect("/login");

  const { checkbox } = req.body;
  try {
    await Item.findByIdAndDelete(checkbox);
    res.redirect(`/lists/${currentUser.username}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/lists/${currentUser.username}`);
  }
});


// Start server
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
