INSERT INTO client_profiles (id, user_id, created_at, updated_at)
SELECT gen_random_uuid(), u.id, NOW(), NOW()
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.slug = 'client'
AND u.id NOT IN (SELECT user_id FROM client_profiles);
