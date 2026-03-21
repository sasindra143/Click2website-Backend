import express from 'express';
import { register, login, logout, refresh, getMe, firebaseAdminLogin, trackWelcomeEmail } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login',    login);
router.post('/firebase-admin', firebaseAdminLogin);
router.post('/refresh',  refresh);
router.post('/logout',   protect, logout);
router.get('/me',        protect, getMe);

// Hidden pixel tracking route
router.get('/track-welcome/:id', trackWelcomeEmail);

export default router;
