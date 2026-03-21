import User from '../models/User.js';

/* ── GET /api/admin/users ── */
export const getAllUsers = async (req, res) => {
  try {
    // Exclude passwords
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('Fetch users error:', err.message);
    res.status(500).json({ message: 'Server error fetching users' });
  }
};

/* ── DELETE /api/admin/users/:id ── */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (user.role === 'admin' && req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own admin account.' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed successfully' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ message: 'Server error deleting user' });
  }
};
