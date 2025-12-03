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
  ssl: { rejectUnauthorized: false }
});

db.connect()
  .then(() => console.log("PostgreSQL connected"))
  .catch(console.error);

// Redis setup
const redis = createClient({ url: process.env.REDIS_URL });

redis.connect()
  .then(() => console.log("Redis connected"))
  .catch(console.error);

// -------------------- ROUTES --------------------
app.get("/", (req, res) => res.render("index.ejs"));
app.get("/register", (req, res) => res.render("register.ejs"));
app.get("/login", (req, res) => res.render("signup.ejs"));

// -------------------- REGISTER --------------------
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const userExists = await db.query("SELECT * FROM details WHERE name = $1", [username]);

    if (userExists.rows.length > 0)
      return res.send("User already exists");

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO details(name, password, hobbies) VALUES($1, $2, $3)",
      [username, hash, []]
    );

    res.render("signup.ejs");
  } catch (err) {
    console.error(err);
    res.send("Error registering user");
  }
});

// -------------------- LOGIN --------------------
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const cacheKey = `user:${username}`;

  try {
    // 1️⃣ CHECK REDIS FIRST
    const cached = await redis.get(cacheKey);
    if (cached) {
      const user = JSON.parse(cached);

      const match = await bcrypt.compare(password, user.password);
      
      if (match) {
        return res.render("home.ejs", {
          name: username,
          hobby: user.hobbies
        });
      } else {
        return res.send("Wrong password");
      }
    }

    // 2️⃣ CHECK POSTGRES
    const result = await db.query("SELECT * FROM details WHERE name = $1", [username]);

    if (result.rows.length === 0)
      return res.send("User does not exist");

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.send("Wrong password");

    const hobbies = user.hobbies || [];

    // 3️⃣ STORE IN REDIS
    await redis.setEx(
      cacheKey,
      3600,
      JSON.stringify({
        name: username,
        password: user.password,
        hobbies
      })
    );

    res.render("home.ejs", { name: username, hobby: hobbies });

  } catch (err) {
    console.error(err);
    res.send("Error logging in");
  }
});

// -------------------- ADD HOBBY --------------------
app.post("/add", async (req, res) => {
  const { task, user } = req.body;

  try {
    await db.query(
      "UPDATE details SET hobbies = array_append(hobbies, $1) WHERE name = $2",
      [task, user]
    );

    const result = await db.query("SELECT * FROM details WHERE name = $1", [user]);
    const updatedUser = result.rows[0];

    await redis.setEx(
      `user:${user}`,
      3600,
      JSON.stringify({
        name: user,
        password: updatedUser.password,
        hobbies: updatedUser.hobbies
      })
    );

    res.render("home.ejs", { name: user, hobby: updatedUser.hobbies });

  } catch (err) {
    console.error(err);
    res.send("Error adding hobby");
  }
});

// -------------------- DELETE HOBBY --------------------
app.post("/delete", async (req, res) => {
  const { task, user } = req.body;

  try {
    await db.query(
      "UPDATE details SET hobbies = array_remove(hobbies, $1) WHERE name = $2",
      [task, user]
    );

    const result = await db.query("SELECT * FROM details WHERE name = $1", [user]);
    const updatedUser = result.rows[0];

    await redis.setEx(
      `user:${user}`,
      3600,
      JSON.stringify({
        name: user,
        password: updatedUser.password,
        hobbies: updatedUser.hobbies
      })
    );

    res.render("home.ejs", { name: user, hobby: updatedUser.hobbies });

  } catch (err) {
    console.error(err);
    res.send("Error deleting hobby");
  }
});

// -------------------- EDIT HOBBY --------------------
app.post("/edit", async (req, res) => {
  const { user, oldtask, newtask } = req.body;

  try {
    await db.query(
      "UPDATE details SET hobbies = array_replace(hobbies, $1, $2) WHERE name = $3",
      [oldtask, newtask, user]
    );

    const result = await db.query("SELECT * FROM details WHERE name = $1", [user]);
    const updatedUser = result.rows[0];

    await redis.setEx(
      `user:${user}`,
      3600,
      JSON.stringify({
        name: user,
        password: updatedUser.password,
        hobbies: updatedUser.hobbies
      })
    );

    res.render("home.ejs", { name: user, hobby: updatedUser.hobbies });

  } catch (err) {
    console.error(err);
    res.send("Error editing hobby");
  }
});

// -------------------- LOGOUT --------------------
app.post("/logout", (req, res) => {
  res.render("index.ejs");
});
app.get("/clear-cache", async (req, res) => {
    try {
        await redis.flushAll();
        res.send("Redis cache cleared successfully!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error clearing Redis");
    }
});

// -------------------- SERVER --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
