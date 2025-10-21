# LockBox

**Cybersecurity & Programming Training Platform**
Full-stack web application built with **Node.js, Express, PostgreSQL, and Docker (Docker Not Required)**.
Provides user authentication, module management, and progress tracking (completed & pinned modules).

---

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the project root with your database credentials:

```env
DB_USER=your_user
DB_PASS=your_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=lockbox
```

> Ensure these match either your **Postgres instance** or the **Docker Compose setup** below.

---

### 2. Database with Docker

To start PostgreSQL using Docker Compose:

```bash
docker compose up -d
```

This will run PostgreSQL and mount `db/init.sql` automatically.
For now, you’ll need to create the tables manually (see schemas below).

---

### 3. HTTPS Certificates

Generate self-signed certs for local HTTPS development:

```bash
cd certs
openssl genrsa -out server.key 2048
openssl req -new -x509 -key server.key -out server.cert -days 365
```

---

## Database Schemas

```sql
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
```

---

Admin Account Creation

To give a user admin rights, run:

```sql
UPDATE users SET role = 'admin' WHERE username = 'YOURNAMEHERE';
```

---

## 📸 Current State

<img width="2559" alt="Landing" src="https://github.com/user-attachments/assets/b38c5718-c2f4-4689-b9d8-5e29c971dcb5" />
<img width="2558" alt="Login" src="https://github.com/user-attachments/assets/9359bb00-706a-41a2-ae34-75af3043d873" />
<img width="2559" alt="Dashboard" src="https://github.com/user-attachments/assets/d37802a0-6b5c-4931-9d0f-d86730539494" />
<img width="2559" alt="Module Manager" src="https://github.com/user-attachments/assets/c8c3e4fd-5bfe-4709-9468-bd947ba98819" />
<img width="234" alt="Account Settings" src="https://github.com/user-attachments/assets/635968a7-afb5-4d68-b9a5-75571b7505ea" />
<img width="633" alt="Avatar Upload" src="https://github.com/user-attachments/assets/41da0f54-748b-4d7f-a465-2c13fef427f2" />
<img width="2559" alt="Module Creation" src="https://github.com/user-attachments/assets/1fbf3602-647e-4f00-a9fe-e057351ac5a9" />
<img width="2559" alt="Module View" src="https://github.com/user-attachments/assets/1a057fd2-6009-498d-af81-890bcf94ee48" />
<img width="2559" alt="Learn" src="https://github.com/user-attachments/assets/6229e978-a53f-4255-a913-c135c758d5d7" />
<img width="2559" alt="Pinned" src="https://github.com/user-attachments/assets/f677db1b-5e8d-4d58-8b7c-6ebf762bcd55" />
<img width="961" alt="Mobile" src="https://github.com/user-attachments/assets/c6699163-c8f0-4ace-bb1e-3b4e1fdf733e" />
<img width="2559" alt="Modules Example" src="https://github.com/user-attachments/assets/8c645207-84c9-4247-b630-e2b0411287f0" />  
<img width="2559" alt="Modules Example 2" src="https://github.com/user-attachments/assets/f593372a-3032-4f59-8cc5-985313b748c3" />  
<img width="2559" alt="Modules Example 3" src="https://github.com/user-attachments/assets/7db89860-e7d7-44db-8ac8-65b2df26cd18" />  


