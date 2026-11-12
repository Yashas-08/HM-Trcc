import { getDb } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { createApp } from '../server/index.js';

getDb();
seedDatabase();

const app = createApp();

export default app;

