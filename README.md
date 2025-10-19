
Postgresql is used for this project.
## .env template (Make sure DB creds match ones you set for your psql db and user or dockercompose): 
```
DB_USER=
DB_PASS=
DB_HOST=
DB_PORT=5432
DB_DATABASE=
```

## Up to date schemas:

```
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  avatar VARCHAR(255) DEFAULT '/uploads/avatars/template-icon.png',
  role VARCHAR(255), DEFAULT 'user'
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

To turn regular user into admin, use:
`UPDATE users SET role = 'admin' WHERE username = 'YOURNAMEHERE';`

## Current State
<img width="2554" height="1439" alt="image" src="https://github.com/user-attachments/assets/51795b2b-c93d-4ad4-9d61-7751be81b7c3" />
<img width="2559" height="1439" alt="image" src="https://github.com/user-attachments/assets/0258dacc-3464-4305-a1e6-ff59847e93a8" />
<img width="2559" height="1439" alt="image" src="https://github.com/user-attachments/assets/ea6d79aa-f258-446d-b0e3-b9f71fa5ef97" />
<img width="2558" height="1308" alt="image" src="https://github.com/user-attachments/assets/6a9dacb5-290a-4208-aed5-75845cb857dd" />
<img width="2559" height="1294" alt="image" src="https://github.com/user-attachments/assets/2b82e62b-f6e0-4628-af12-9571cb727530" />
<img width="2545" height="1280" alt="image" src="https://github.com/user-attachments/assets/13565a0e-0f83-4c3d-9e44-ceb7cd6876ed" />
<img width="2555" height="1305" alt="image" src="https://github.com/user-attachments/assets/d02834df-34a8-4539-85cc-95a80901b40a" />
<img width="2556" height="1286" alt="image" src="https://github.com/user-attachments/assets/475a30ef-183f-43f4-965c-314765dd46c9" />
<img width="2559" height="1343" alt="image" src="https://github.com/user-attachments/assets/bf82e4c8-ff32-4d47-b086-067d4b9c4568" />
<img width="2559" height="1439" alt="image" src="https://github.com/user-attachments/assets/95568e4e-349a-4ad9-b286-689f60346bb9" />
<img width="2559" height="1033" alt="image" src="https://github.com/user-attachments/assets/e2a1bf16-b2d9-4e26-8871-cf196aa8af66" />
<img width="2559" height="788" alt="image" src="https://github.com/user-attachments/assets/da3a3440-b6b2-4a73-81ac-7b66e2417c2e" />
<img width="2558" height="1303" alt="image" src="https://github.com/user-attachments/assets/6cad1ef2-48a6-41ac-a530-7ece6e347863" />
<img width="346" height="324" alt="image" src="https://github.com/user-attachments/assets/26cb8f9d-d990-4679-b11e-9b11b833cabc" />
<img width="2559" height="923" alt="image" src="https://github.com/user-attachments/assets/75e645d3-45cc-4815-9f9e-f82ee7ac0ecb" />

