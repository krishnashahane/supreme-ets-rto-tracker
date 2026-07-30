// Usage: node scripts/hash-password.mjs "your-password"
import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"');
  process.exit(1);
}
const hash = await bcrypt.hash(pw, 12);
console.log(hash);
