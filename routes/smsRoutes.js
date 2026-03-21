import express from 'express';
import { sendSMS, getSmsStats } from '../controllers/smsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/send',  protect, sendSMS);
router.get('/stats',  protect, getSmsStats);

export default router;
