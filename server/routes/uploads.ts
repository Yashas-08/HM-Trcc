import { Router } from 'express';
import { authenticateJWT, upload } from '../middleware/auth.js';

export const uploadsRouter = Router();
uploadsRouter.use(authenticateJWT);

uploadsRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No valid file uploaded' });
    return;
  }
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

