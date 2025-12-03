import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env

const app = express();
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// PostgreSQL setup (with SSL for Render)
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false, // required for Render Postgres
  },
});

db.connect()
  .then(() => console.log("PostgreSQL connected"))
  .catch(console.error);

// Redis setup
const redis = createClient({ url: process.env.REDIS_URL });
redis
  .connect()
  .then(() => console.log("Redis connected"))
  .catch(console.error);

// Routes
app.get("/", (req, res) => res.render("index.ejs"));
app.get("/register", (req, res) => res.render("register.ejs"));
app.get("/login", (req, res) => res.render("signup.ejs"));

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const checkUser = await db.query("SELECT * FROM details WHERE name = $1", [username]);
    if (checkUser.rows.length > 0) return res.send("User already exists");

    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO details(name, password) VALUES($1, $2)", [username, hash]);
    res.render("signup.ejs");
  } catch (err) {
    console.error(err);
    res.send("Error registering user");
  }
});

// LOGIN with Redis caching
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const cacheKey = `user:${username}`;

  try {
    // 1️⃣ Check Redis
    const cachedUser = await redis.get(cacheKey);
    if (cachedUser) {
      const parsed = JSON.parse(cachedUser);
      const match = await bcrypt.compare(password, parsed.password);
      if (match) return res.render("home.ejs", { name: username, hobby: parsed.hobbies });
      else return res.send("Wrong password");
    }

    // 2️⃣ If not in Redis → PostgreSQL
    const result = await db.query("SELECT * FROM details WHERE name = $1", [username]);
    if (result.rows.length === 0) return res.send("User does not exist");

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Wrong password");

    const hobbies = user.hobbies || [];

    // 3️⃣ Store in Redis for 1 hour
    await redis.setEx(cacheKey, 3600, JSON.stringify({ name: username, password: user.password, hobbies }));

    res.render("home.ejs", { name: username, hobby: hobbies });
  } catch (err) {
    console.error(err);
    res.send("Error logging in");
  }
});

// ADD hobby
app.post("/add", async (req, res) => {
  const { task, user } = req.body;
  await db.query("UPDATE details SET hobbies = array_append(hobbies, $1) WHERE name = $2", [task, user]);
  const hobbyRes = await db.query("SELECT hobbies FROM details WHERE name = $1", [user]);
  const hobbies = hobbyRes.rows[0].hobbies;

  await redis.setEx(`user:${user}`, 3600, JSON.stringify({ name: user, hobbies }));
  res.render("home.ejs", { name: user, hobby: hobbies });
});

// DELETE hobby
app.post("/delete", async (req, res) => {
  const { task, user } = req.body;
  await db.query("UPDATE details SET hobbies = array_remove(hobbies, $1) WHERE name = $2", [task, user]);
  const hobbyRes = await db.query("SELECT hobbies FROM details WHERE name = $1", [user]);
  const hobbies = hobbyRes.rows[0].hobbies;

  await redis.setEx(`user:${user}`, 3600, JSON.stringify({ name: user, hobbies }));
  res.render("home.ejs", { name: user, hobby: hobbies });
});

// EDIT hobby
app.post("/edit", async (req, res) => {
  const { user, oldtask, newtask } = req.body;
  await db.query("UPDATE details SET hobbies = array_replace(hobbies, $1, $2) WHERE name = $3", [oldtask, newtask, user]);
  const hobbyRes = await db.query("SELECT hobbies FROM details WHERE name = $1", [user]);
  const hobbies = hobbyRes.rows[0].hobbies;

  await redis.setEx(`user:${user}`, 3600, JSON.stringify({ name: user, hobbies }));
  res.render("home.ejs", { name: user, hobby: hobbies });
});

// LOGOUT
app.get("/logout", async (req, res) => {
  try {
    res.render("index.ejs");
  } catch (err) {
    console.error(err);
    res.send("Error logging out");
  }
});

// Dynamic port for deployment
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
