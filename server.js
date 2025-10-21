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
import multer from "multer";
dotenv.config();


const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
});
await client.connect();


const uploadDirectory = path.join(process.cwd(), "uploads", "avatars");
if(!fs.existsSync(uploadDirectory)) 
  {
  fs.mkdirSync(uploadDirectory, {recursive: true});
}


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirectory),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});


const upload = multer({storage});

async function getAvatar(webPath) {
  const fallback = "/uploads/avatars/template-icon.png";
  const safeWeb = (webPath && webPath.trim() !== "") ? webPath : fallback;
  // convert to filesystem path
  const rel = safeWeb.replace(/^\/+/, "");
  const fsPath = path.join(process.cwd(), rel);
  try {
    await fsp.access(fsPath); 
    return safeWeb;
  } catch {
    return fallback;
  }
}


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
    if(result.rows.length > 0) { return res.redirect("/dashboard");
    } else{ return res.sendFile(path.join(process.cwd(), "public", "index.html")); }
  } catch(err){ return res.status(404); }
});
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));



app.get("/login", (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(sessionId) return res.redirect("/")
  return res.sendFile(path.join(process.cwd(), "public", "login.html"));
});


app.post("/login", async (req, res) => {
  const {username, password} = req.body;
  try{
    const q1_resp = await client.query("SELECT id, username, password FROM users WHERE username = $1", [username]);
    if(q1_resp.rows.length === 0){ return res.send(`<script> alert("Incorrect Credentials."); window.location.href = "/login" </script>`); }
    const user = q1_resp.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if(!valid){ return res.send(`<script> alert("Incorrect Credentials."); window.location.href = "/login" </script>`); }
    const sessionId = generateSessionId();
    await client.query("INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')", [sessionId, user.id]);
      res.cookie("sessionId", sessionId, {httpOnly: true, secure: false, sameSite: "lax", maxAge: 3600 * 1000});
      return res.redirect("/dashboard"); 
  } catch(err){
    return res.redirect("/");
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
  const sessionId = req.cookies.sessionId;
  if(sessionId) return res.redirect('/');
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


// API ENDPOINTS - START
app.post("/api/account/change_password", async (req,res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.status(401).json({ error: "Unauthorised" });
  const result = await client.query("SELECT users.username, users.password FROM sessions JOIN users on sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0){
    return res.status(401).json({ error: "Unauthorised" });
  }
  try{
    const {old_password, new_password_1, new_password_2} = req.body;
    const user = result.rows[0];
    if(new_password_1 !== new_password_2){
      return res.send('<script> alert("Password do not match"); window.location.href="/account_settings"</script>');
    } else if(new_password_1 === old_password || new_password_2 === old_password){
      return res.send('<script> alert("You cannot use the same password"); window.location.href="/account_settings"</script>');
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(new_password_1, saltRounds);
    const matching = await bcrypt.compare(new_password_1, user.password);
    const correct_old = await bcrypt.compare(old_password, user.password);
    if(matching){
      return res.send('<script> alert("Passwords are the same"); window.location.href="/account_settings"</script>');
    }
    if(!correct_old){
      return res.send('<script> alert("Incorrect password"); window.location.href="/account_settings"</script>');
    }
    await client.query("UPDATE users SET password = $1 WHERE username = $2", [hashedPassword, user.username]);
    return res.send('<script> alert("Password successfully updated"); window.location.href="/account_settings"</script>');
  } catch (err){
    return res.json({ error: "Internal server error" });
  }
});



app.get("/api/modules/category/:category", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.status(401).json({ error: "Unauthorized" });

  const usr_result = await client.query(
    "SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()",
    [sessionId]
  );

  if (usr_result.rows.length === 0) return res.status(401).json({ error: "Unauthorized" });

  const user_id = usr_result.rows[0].id;
  const category = req.params.category;

  try {
    const result = await client.query(
      "SELECT mdl.id, mdl.name, mdl.thumb, mdl.description, umd.pinned, COALESCE(umd.completed, false) AS completed FROM modules mdl LEFT JOIN user_module_data umd ON umd.module_id = mdl.id AND umd.user_id = $1 WHERE mdl.category = $2",
      [user_id, category]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No modules found for this category" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching modules:", err);
    res.status(500).json({ error: "Failed to load modules" });
  }
});

app.get("/api/modules/get_pinned", async (req, res) =>
{
  try{
    const sessionId = req.cookies.sessionId;
    if(!sessionId) return res.status(401).json({error: "Unauthorised"});
    const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
    if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});
    const user_id = usr_result.rows[0].id;
    const result = await client.query("SELECT mdl.id, mdl.name, mdl.thumb, mdl.description, umd.pinned, COALESCE(umd.completed, false) AS completed FROM modules mdl LEFT JOIN user_module_data umd ON umd.module_id = mdl.id AND umd.user_id = $1 WHERE umd.pinned = true", [user_id]);
    res.json(result.rows); 
  } catch (err){ return res.json({error: "Failed to obtain pinned modules."}); }
});


app.get("/api/modules/content", async (req, res) => {
  try{
    const sessionId = req.cookies.sessionId;
    if(!sessionId) return res.status(401).json({error: "Unauthorised"});
    const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
    if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});
    const user_id = usr_result.rows[0].id;
    const result = await client.query("SELECT mdl.id, mdl.name, mdl.thumb, mdl.description, mdl.content, COALESCE(umd.completed, false) AS completed FROM modules mdl LEFT JOIN user_module_data umd ON umd.module_id = mdl.id AND umd.user_id = $1 WHERE mdl.category = 'cybersecurity'", [user_id]);
    res.json(result.rows); 
  } catch (err){ return res.json({error: "Failed to load module content"}); }
});


app.get("/api/modules/:id/status", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.status(401).json({error: "Unauthorised"});
  const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});  
  const user_id = usr_result.rows[0].id;
  const module_id = req.params.id;
  try{
    const result = await client.query("SELECT completed FROM user_module_data WHERE user_id = $1 AND module_id = $2", [user_id, module_id]);
    const completed = result.rows.length > 0 ? result.rows[0].completed : false;
    res.json({completed});
  } catch (err) {
    console.error(err);
    res.json({error: "Failed to fetch status for module"});
  }
 });


app.post("/api/modules/:id/pin", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.status(401).json({error: "Unauthorised"});
  const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});  
  const user_id = usr_result.rows[0].id;
  const module_id = req.params.id;
  try{
    const check = await client.query("SELECT pinned FROM user_module_data WHERE user_id = $1 AND module_id = $2", [user_id, module_id]);
    if(check.rows.length > 0){
      const newly_pinned = !check.rows[0].pinned;
      await client.query("UPDATE user_module_data SET pinned = $1 WHERE user_id = $2 AND module_id = $3", [newly_pinned, user_id, module_id]);
      return res.json({pinned: newly_pinned});
    } else {
      await client.query("INSERT INTO user_module_data (user_id, module_id, pinned) VALUES ($1, $2, true)", [user_id, module_id]);
      return res.json({pinned: true});
    }
  } catch (err) {
    console.error(err);
    res.json({error: "Failed to toggle"});
  }
});


app.post("/api/modules/:id/complete", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.status(401).json({error: "Unauthorised"});
  const usr_result = await client.query("SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});  
  const user_id = usr_result.rows[0].id;
  const module_id = parseInt(req.params.id);
  try{
    const check = await client.query("SELECT completed FROM user_module_data WHERE user_id = $1 AND module_id = $2", [user_id, module_id]);
    let updated_stat;
    if(check.rows.length > 0) {
      updated_stat = !check.rows[0].completed;
      await client.query("UPDATE user_module_data SET completed = $1 WHERE user_id = $2 AND module_id = $3", [updated_stat, user_id, module_id]);
    } else {
      updated_stat = true;
      await client.query("INSERT INTO user_module_data (user_id, module_id, completed) VALUES ($1, $2, true)", [user_id, module_id]);
    }
    res.json({completed: updated_stat});
  } catch (err){ 
    console.error(err);
    res.json({ error: "Failed to toggle module stat"});
  }
});


app.post("/api/account/upload-avatar", upload.single("avatar"), async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.status(401).json({error: "Unauthorised"});
  const usr_result = await client.query("SELECT users.id, users.avatar FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(usr_result.rows.length === 0) return res.status(401).json({erorr: "Unauthorised"});
  const user_id = usr_result.rows[0].id;
  const old_avatar = usr_result.rows[0].avatar;
  if(old_avatar && !old_avatar.includes("template-icon.png")) {
    try{ await fsp.unlink(path.join(process.cwd(), old_avatar)); }
    catch (err) { console.error("Failed to delete", err); }
  }  
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  await client.query("UPDATE users SET avatar = $1 WHERE id = $2", [avatarPath, user_id]);
  res.json({ success: true, avatar: avatarPath });
});


app.get("/api/fetch/userRole", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.status(401).json({ error: "Unauthorised" });
  try {
    const result = await client.query("SELECT users.role FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorised" });
    }
    return res.json({ role: result.rows[0].role });
  } catch (err) {
    return res.json({ error: "Internal server error" });
  }
});
// API ENDPOINTS - START


app.get("/dashboard", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login"); 
  const result = await client.query("SELECT users.username, users.avatar FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const username = result.rows[0].username;
  const avatar = await getAvatar(result.rows[0].avatar); 
  let dashboard_html = await fsp.readFile(
  path.join(process.cwd(), "public", "dashboard.html"), { encoding: "utf8" });
  dashboard_html = dashboard_html.replace("{{username}}", username).replace(/{{avatar}}/g, avatar);
  res.send(dashboard_html);
});


app.get("/account_settings", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login"); 
  const result = await client.query("SELECT users.username, users.avatar, users.role FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const username = result.rows[0].username;
  const role = result.rows[0].role;
  const avatar = await getAvatar(result.rows[0].avatar);
  let account_settings_html = await fsp.readFile(
  path.join(process.cwd(), "public", "account_settings.html"), { encoding: "utf8" });
  account_settings_html = account_settings_html.replace("{{username}}", username).replace(/{{avatar}}/g, avatar).replace(/{{role}}/g, role);
  res.send(account_settings_html);
});

app.get("/admin/settings", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login");
  const result = await client.query("SELECT users.username, users.avatar, users.role FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  if(result.rows[0].role !== "admin") return res.redirect("/dashboard");
  const avatar = await getAvatar(result.rows[0].avatar);
  let admin_settings_html = await fsp.readFile(path.join(process.cwd(), "public", "admin_settings.html"), { encoding: "utf8"});
  admin_settings_html = admin_settings_html.replace(/{{avatar}}/g, avatar);
  res.send(admin_settings_html);
});


app.get("/learn", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login");
  const result = await client.query("SELECT users.username, users.avatar FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const username = result.rows[0].username;
  const avatar = await getAvatar(result.rows[0].avatar);
  let learn_html = await fsp.readFile(
  path.join(process.cwd(), "public", "learn.html"), { encoding: "utf8" });
  learn_html = learn_html.replace("{{username}}", username).replace(/{{avatar}}/g, avatar);
  res.send(learn_html);
});


app.get("/learning", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if(!sessionId) return res.redirect("/login");
  const result = await client.query("SELECT users.username, users.avatar FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = $1 AND sessions.expires_at > NOW()", [sessionId]);
  if(result.rows.length === 0) return res.redirect("/login");
  const moduleId = req.query.id;
  
  const mdl_res = await client.query("SELECT name, description, content FROM modules WHERE id = $1", [moduleId]);
  let module_title, module_description, module_content;
  if(mdl_res.rows.length !== 0) {
    module_title = mdl_res.rows[0].name;
    module_description = mdl_res.rows[0].description;
    module_content = mdl_res.rows[0].content;
  } else {
    module_title = "Unable to load module data.";
    module_description = "Unable to load module data.";
    module_content = "Unable to load module data.";
  }
  const avatar = await getAvatar(result.rows[0].avatar);
  let learning_html = await fsp.readFile(path.join(process.cwd(), "public", "learning.html"), { encoding: "utf8" });
  learning_html = learning_html.replace("{{module_title}}", module_title).replace("{{module_description}}", module_description).replace("{{module_content}}", module_content).replace(/{{avatar}}/g, avatar).replace("{{module_id}}", String(moduleId));
  res.send(learning_html);
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
  password VARCHAR(255) NOT NULL,
  avatar VARCHAR(255) DEFAULT '/uploads/avatars/template-icon.png',
  role VARCHAR(255) DEFAULT 'user'
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
  content TEXT,
  thumb VARCHAR(255)
);

CREATE TABLE user_module_data (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  module_id INT REFERENCES modules(id) ON DELETE CASCADE,
  completed BOOL DEFAULT false,
  pinned BOOL DEFAULT false
);

 */
