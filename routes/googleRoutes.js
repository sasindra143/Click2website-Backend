import express from 'express';
import { getAuthUrl, handleCallback, disconnect, getStatus } from '../controllers/googleController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/auth-url',   protect, getAuthUrl);
router.get('/callback',   handleCallback);   // Google redirects here (no JWT)
router.post('/disconnect', protect, disconnect);
router.get('/status',     protect, getStatus);

export default router;
