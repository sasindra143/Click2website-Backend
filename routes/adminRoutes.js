import express from 'express';
import {
  getAllUsers,
  deleteUser,
  toggleAutomation,
  sendCustomSMS,
  getDashboardStats,
} from '../controllers/adminController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/users',                      protect, admin, getAllUsers);
router.delete('/users/:id',              protect, admin, deleteUser);
router.patch('/users/:id/pause-automation', protect, admin, toggleAutomation);
router.post('/users/:id/send-sms',       protect, admin, sendCustomSMS);
router.get('/stats',                     protect, admin, getDashboardStats);

export default router;
