const { supabase } = require('../lib/supabaseClient.js');


const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return res.status(401).json({ error: 'Unauthorized' });
}

const token = authHeader.split(' ')[1];

try {
  // 1. Verify Supabase token
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData?.user) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  const userId = authData.user.id;

  // 2. Fetch matching user from your 'users' table
  const { data: userProfile, error: userProfileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single(); // Ensures only one record is returned

  if (userProfileError) {
    console.error('Failed to fetch user from users table:', userProfileError);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }

    // 3. Attach both auth and user data
    req.user = authData.user;      // From supabase.auth.users
    req.userProfile = userProfile;     // From your 'users' table

    next();

  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

};

module.exports = authMiddleware;
