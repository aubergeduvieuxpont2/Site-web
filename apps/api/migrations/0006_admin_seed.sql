-- Manual fallback: UPDATE users SET role='admin' WHERE lower(email)=lower('you@example.com');
UPDATE users SET role = 'admin' WHERE lower(email) = lower(':ADMIN_EMAIL');
