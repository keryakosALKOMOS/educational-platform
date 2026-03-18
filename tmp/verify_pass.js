const bcrypt = require('bcrypt');

const password = 'kero';
const hash = '$2b$10$wOW5VILuiU7oW5VILuiU7'; // Note: The previous output was truncated, I should get the full hash if possible.
// Wait, the output was truncated. I'll get the full row first.

// Let's rewrite check_user.js to output the full hash clearly.
