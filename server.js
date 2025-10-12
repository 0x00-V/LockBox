import express from 'express';
import https from "https";
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { Client } from 'pg';
import cookieParser from "cookie-parser";
import fs from "fs";
import fsp from "fs/promises";
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
      return res.redirect("/dashboard");
    } else{
      return res.sendFile(path.join(process.cwd(), "public", "index.html"));
    }
  } catch(err){
      return res.status(404);
  }
});
app.use(express.static("public"));


app.get("/login", (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(sessionId) return res.redirect("/")
  return res.sendFile(path.join(process.cwd(), "public", "login.html"));
});


app.post("/login", async (req, res) => {
  const {username, password} = req.body;

  try{
    const q1_resp = await client.query("SELECT id, username, password FROM users WHERE username = $1", [username]);

    if(q1_resp.rows.length === 0){
      return res.send(`<script> alert("Incorrect Credentials."); window.location.href = "/login" </script>`);
    }
    const user = q1_resp.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if(!valid){
     return res.send(`<script> alert("Incorrect Credentials."); window.location.href = "/login" </script>`);
    }
    const sessionId = generateSessionId();
    await client.query("INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')", [sessionId, user.id]);
      res.cookie("sessionId", sessionId, {httpOnly: true, secure: false, sameSite: "lax", maxAge: 3600 * 1000});
      return res.redirect("/dashboard"); 
  } catch(err){
    return res.status(404);
  }
});


app.post("/logout", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.sendFile(path.join(process.cwd(), "public", "index.html"));
  await client.query("DELETE FROM sessions WHERE session_id = $1", [sessionId]);
  res.clearCookie("sessionId");
  return res.redirect("/");
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
    return res.send(`<script> alert("Account successfully Created!"); window.location.href = "/login" </script>`);
  } catch(err){
    return res.send('<script> alert("Username taken."); window.location.href = "/register" </script>');
  }
});


app.get("/api/modules/coding", async (req, res) => {
  try{
    const sessionId = req.cookies.sessionId;
    if(!sessionId) return res.status(401).json({error: "Unauthorised"});
    const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
    if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});
    
   const user_id = usr_result.rows[0].id;


    const result = await client.query("SELECT mdl.id, mdl.name, mdl.thumb, mdl.description, COALESCE(umd.completed, false) AS completed FROM modules mdl LEFT JOIN user_module_data umd ON umd.module_id = mdl.id AND umd.user_id = $1 WHERE mdl.category = 'coding'", [user_id]);
    res.json(result.rows);
  } catch (err)
  {
    return res.status(500).json({error: "Failed to load modules"});
  }
});

app.get("/api/modules/cybersecurity", async (req, res) => {
  try{
    const sessionId = req.cookies.sessionId;
    if(!sessionId) return res.status(401).json({error: "Unauthorised"});
    const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
    if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});
    
   const user_id = usr_result.rows[0].id;


    const result = await client.query("SELECT mdl.id, mdl.name, mdl.thumb, mdl.description, COALESCE(umd.completed, false) AS completed FROM modules mdl LEFT JOIN user_module_data umd ON umd.module_id = mdl.id AND umd.user_id = $1 WHERE mdl.category = 'cybersecurity'", [user_id]);
    res.json(result.rows);
  } catch (err)
  {
    return res.status(500).json({error: "Failed to load modules"});
  }
});


app.get("/dashboard", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login"); 
  const result = await client.query("SELECT users.username FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const username = result.rows[0].username;
  let dashboard_html = await fsp.readFile(
  path.join(process.cwd(), "public", "dashboard.html"), { encoding: "utf8" });
  dashboard_html = dashboard_html.replace("{{username}}", username);
  res.send(dashboard_html);
});


app.get("/account_settings", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login"); 
  const result = await client.query("SELECT users.username FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const username = result.rows[0].username;
  let account_settings_html = await fsp.readFile(
  path.join(process.cwd(), "public", "account_settings.html"), { encoding: "utf8" });
  account_settings_html = account_settings_html.replace("{{username}}", username);
  res.send(account_settings_html);

});


app.get("/learn", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login");
  const result = await client.query("SELECT users.username FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const username = result.rows[0].username;
  let learn_html = await fsp.readFile(
  path.join(process.cwd(), "public", "learn.html"), { encoding: "utf8" });
  learn_html = learn_html.replace("{{username}}", username);
  res.send(learn_html);
});


const options = {
  key: fs.readFileSync("certs/server.key"),
  cert: fs.readFileSync("certs/server.cert"),
};

https.createServer(options, app).listen(8443, "0.0.0.0", () => {
  console.log("HTTPS Server live at: https://0.0.0.0:8443");
});


app.use(async (req, res) => {
  res.status(404).redirect("/");
});

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

CREATE TABLE modules (
  id SERIAL PRIMARY KEY,
  category VARCHAR(255) NOT NULL,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  content TEXT
  thumb VARCHAR(255)
);

CREATE TABLE user_module_data (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  module_id INT REFERENCES modules(id) ON DELETE CASCADE,
  completed BOOL DEFAULT false
);

 */
