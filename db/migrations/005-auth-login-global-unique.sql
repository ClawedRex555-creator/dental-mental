-- Один email = одна учётка входа на всей платформе (все клиники)
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_login_global ON auth_users (login);
