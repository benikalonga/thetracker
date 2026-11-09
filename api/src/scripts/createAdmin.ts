import bcrypt from 'bcryptjs';
import { db } from '../lib/db';

/** Usage: npm run user:admin -- YOUR_EMAIL@fakeemail.com 'YOUR_PASSWORD' "YOUR_NAME" */
async function main() {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password || !fullName) throw new Error('Usage: createAdmin <email> <password> <full name>');
  if (password.length < 10) throw new Error('Use a password of at least 10 characters.');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), fullName, passwordHash, role: 'ADMIN' },
    update: { fullName, passwordHash, role: 'ADMIN', isActive: true },
  });
  console.log(`✓ ${user.email} is an admin.`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}).finally(() => db.$disconnect());
