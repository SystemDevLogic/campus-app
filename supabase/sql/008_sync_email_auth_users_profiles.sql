ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE profiles
SET email = u.email
FROM auth.users u
WHERE profiles.id = u.id;