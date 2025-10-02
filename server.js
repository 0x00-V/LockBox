import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { Client } from 'pg';
import cookieParser from "cookie-parser";
import fs from "fs/promises";
import bcrypt from "bcrypt";
dotenv.config();


const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
});
await client.connect();


function generateSessionId() { return crypto.randomBytes(32).toString("base64url"); }

const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true}));
app.use(express.json());

app.get("/", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.sendFile(path.join(process.cwd(), "public", 'index.html'));
  try {
    const result = await client.query('SELECT users.username FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()', [sessionId]);
    if(result.rows.length > 0) {
      let logged_in_html = await fs.readFile(path.join(process.cwd(), "public", "li_index.html"), "utf8");
      const username = result.rows[0].username;
      logged_in_html = logged_in_html.replace("{{username}}", username);
      return res.send(logged_in_html);
    } else{
      return res.sendFile(path.join(process.cwd(), "public", "index.html"));
    }
  } catch(err){
      return res.status(500).send(`Error checking session: ${err}`);
  }
});


app.get("/login", (req, res) => {
  return res.sendFile(path.join(process.cwd(), "public", "login.html"));
});


app.post("/login", async (req, res) => {
  const {username, password} = req.body;

  try{
    // Will compare hashes later on in the project. DO NOT USE THIS IN PROD!
    const q1_resp = await client.query("SELECT id, username, password FROM users WHERE username = $1", [username]);

    if(q1_resp.rows.length === 0){
      return res.status(401).send("Incorrect Credentials");
    }
    const user = q1_resp.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if(!valid){
      return res.status(401).send("Incorrect Credentials.");
    }
    const sessionId = generateSessionId();
    await client.query("INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')", [sessionId, user.id]);
      res.cookie("sessionId", sessionId, {httpOnly: true, secure: false, sameSite: "lax", maxAge: 3600 * 1000});
      return res.redirect("/"); 
  } catch(err){
    return res.status(500).send(`Error logging in: ${err}`);
  }
});


app.post("/logout", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.sendFile(path.join(process.cwd(), "public", "index.html"));
  await client.query("DELETE FROM sessions WHERE session_id = $1", [sessionId]);
  res.clearCookie("sessionId");
  return res.sendFile(path.join(process.cwd(), "public", "index.html"));
})

app.get("/register", (req, res) => {
  return res.sendFile(path.join(process.cwd(), "public", "register.html"));
});
app.post("/register", async (req, res) => {
  const {username, password} = req.body;

  try{
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await client.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, hashedPassword]);
    return res.status(201).send("User created.");
  } catch(err){
    return res.status(500).send(`Error creating user: ${err}`);
  }
});

app.listen(8080, "127.0.0.1", () => { console.log("Server live at: http://127.0.0.1")});



/*

My Current Schemas:
 
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);


 */
