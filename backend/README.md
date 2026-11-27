# backend

A project created with FastAPI CLI.

## Quick Start

### Configure environment variables

If `backend/.env` does not exist, create it from `.env.example`. If it already
exists, keep its current values and add or update the Cloudinary variables
there. Use a local or test database because startup runs schema updates. Keep
`.env` private; it is ignored by Git.

On Windows PowerShell, from the repository root:

```powershell
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

### Initialize a new database

These steps are for a new, empty PostgreSQL database. Do not run
`schema_base.sql` on a database that already contains application tables.

1. Run `schema_base.sql` from the PostgreSQL Query Tool or `psql` to create the
   tables, types, sequences, and constraints.
2. Run `seed_initial_data.sql` to add the application roles, default
   configuration, and a clearly marked demo company. It is safe to rerun and
   does not overwrite existing rows. Replace the demo company values before
   using it in production. Payment methods are enum values; `metodos_pagos`
   stores payment details per movement and should remain empty initially.
3. Start the backend and create the first administrator as described below.
   The application startup applies compatibility changes but does not create
   the base schema.

### Start the development server

```bash
uv run fastapi dev
```

Visit http://localhost:8000

### Create the first administrator

Run this once from the `backend` directory. The script asks for the account
details and password in the terminal; it only works while the `users` table is
empty.

```powershell
uv run python create_admin.py
```

After creation, sign in through the application with that username and
password. Keep the password private.

### Deploy to FastAPI Cloud

Sign up and log in at https://fastapicloud.com, then deploy with:

```bash
uv run fastapi deploy
```

## Project Structure

- `main.py` - Your FastAPI application
- `pyproject.toml` - Project dependencies

## Learn More

- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [FastAPI Cloud](https://fastapicloud.com)
