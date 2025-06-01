const { supabase } = require('../lib/supabaseClient.js');


const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Optionally attach user info to the request
    req.user = data.user;

    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = authMiddleware;
