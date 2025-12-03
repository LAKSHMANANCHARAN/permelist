import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// PostgreSQL setup
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: { rejectUnauthorized: false },
});

db.connect().then(() => console.log("PostgreSQL connected"));

// Redis setup
const redis = createClient({ url: process.env.REDIS_URL });

redis.connect().then(() => console.log("Redis connected"));

// ROUTES
app.get("/", (req, res) => res.render("index"));
app.get("/register", (req, res) => res.render("register"));
app.get("/login", (req, res) => res.render("signup"));

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const check = await db.query("SELECT * FROM details WHERE name = $1", [
      username,
    ]);

    if (check.rows.length > 0) return res.send("User already exists!");

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO details(name, password, hobbies) VALUES ($1, $2, $3)",
      [username, hash, []]
    );

    res.redirect("/login");
  } catch (err) {
    console.log(err);
    res.send("Error registering user");
  }
});

// LOGIN
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const cacheKey = `user:${username}`;

  try {
    // Check Redis cache
    const cached = await redis.get(cacheKey);

    if (cached) {
      const user = JSON.parse(cached);

      const match = await bcrypt.compare(password, user.password);
      if (match)
        return res.render("home", {
          name: username,
          hobby: user.hobbies,
        });

      return res.send("Wrong password");
    }

    // Check PostgreSQL
    const result = await db.query("SELECT * FROM details WHERE name = $1", [
      username,
    ]);

    if (result.rows.length === 0) return res.send("User not found");

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Wrong password");

    const hobbies = user.hobbies || [];

    // Store in redis
    await redis.setEx(
      cacheKey,
      3600,
      JSON.stringify({ password: user.password, hobbies })
    );

    res.render("home", { name: username, hobby: hobbies });
  } catch (err) {
    console.log(err);
    res.send("Error logging in");
  }
});

// ADD hobby
app.post("/add", async (req, res) => {
  const { task, user } = req.body;

  await db.query(
    "UPDATE details SET hobbies = array_append(hobbies, $1) WHERE name = $2",
    [task, user]
  );

  const result = await db.query(
    "SELECT hobbies FROM details WHERE name = $1",
    [user]
  );

  const hobbies = result.rows[0].hobbies;

  await redis.setEx(
    `user:${user}`,
    3600,
    JSON.stringify({ hobbies, name: user })
  );

  res.render("home", { name: user, hobby: hobbies });
});

// DELETE hobby
app.post("/delete", async (req, res) => {
  const { task, user } = req.body;

  await db.query(
    "UPDATE details SET hobbies = array_remove(hobbies, $1) WHERE name = $2",
    [task, user]
  );

  const result = await db.query(
    "SELECT hobbies FROM details WHERE name = $1",
    [user]
  );

  const hobbies = result.rows[0].hobbies;

  await redis.setEx(
    `user:${user}`,
    3600,
    JSON.stringify({ hobbies, name: user })
  );

  res.render("home", { name: user, hobby: hobbies });
});

// EDIT hobby
app.post("/edit", async (req, res) => {
  const { user, oldtask, newtask } = req.body;

  await db.query(
    "UPDATE details SET hobbies = array_replace(hobbies, $1, $2) WHERE name = $3",
    [oldtask, newtask, user]
  );

  const result = await db.query(
    "SELECT hobbies FROM details WHERE name = $1",
    [user]
  );

  const hobbies = result.rows[0].hobbies;

  await redis.setEx(
    `user:${user}`,
    3600,
    JSON.stringify({ hobbies, name: user })
  );

  res.render("home", { name: user, hobby: hobbies });
});

// LOGOUT
app.post("/logout", (req, res) => {
  res.render("index");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
