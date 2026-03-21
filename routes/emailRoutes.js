import express from 'express';
import { sendEmail, getEmailStats, getInbox } from '../controllers/emailController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/send',  protect, sendEmail);
router.get('/stats',  protect, getEmailStats);
router.get('/inbox',  protect, getInbox);

export default router;
