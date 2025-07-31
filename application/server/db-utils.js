#!/usr/bin/env node
/**
 * Database utility functions for Foodtrace BFF Server
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = './foodtrace.db';

function getDb() {
  return new sqlite3.Database(DB_PATH);
}

async function listUsers() {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.all('SELECT id, username, chaincode_alias, role, is_admin, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
      db.close();
    });
  });
}

async function deleteUser(username) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.run('DELETE FROM users WHERE username = ?', [username], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
      db.close();
    });
  });
}

async function resetPassword(username, newPassword) {
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, username], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
      db.close();
    });
  });
}

async function makeAdmin(username) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.run('UPDATE users SET is_admin = 1 WHERE username = ?', [username], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
      db.close();
    });
  });
}

async function removeAdmin(username) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.run('UPDATE users SET is_admin = 0 WHERE username = ?', [username], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
      db.close();
    });
  });
}

async function backupDatabase(backupPath) {
  if (!backupPath) {
    backupPath = `./backups/foodtrace_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  }

  // Ensure backup directory exists
  const backupDir = backupPath.substring(0, backupPath.lastIndexOf('/'));
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(DB_PATH);
    const writeStream = fs.createWriteStream(backupPath);

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('close', () => resolve(backupPath));

    readStream.pipe(writeStream);
  });
}

async function restoreDatabase(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(backupPath);
    const writeStream = fs.createWriteStream(DB_PATH);

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('close', () => resolve(true));

    readStream.pipe(writeStream);
  });
}

async function getDatabaseStats() {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.all(`
      SELECT 
        role,
        COUNT(*) as count,
        SUM(is_admin) as admins
      FROM users 
      GROUP BY role
      UNION ALL
      SELECT 
        'TOTAL' as role,
        COUNT(*) as count,
        SUM(is_admin) as admins
      FROM users
    `, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
      db.close();
    });
  });
}

// CLI Interface
async function cli() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'list':
        console.log('📋 User List:');
        console.log('='.repeat(80));
        const users = await listUsers();
        if (users.length === 0) {
          console.log('No users found.');
        } else {
          console.log('ID | Username          | Alias             | Role        | Admin | Created');
          console.log('-'.repeat(80));
          users.forEach(user => {
            const created = new Date(user.created_at).toLocaleDateString();
            console.log(
              `${user.id.toString().padEnd(2)} | ${user.username.padEnd(16)} | ${user.chaincode_alias.padEnd(16)} | ${user.role.padEnd(10)} | ${user.is_admin ? 'Yes' : 'No'} | ${created}`
            );
          });
        }
        break;

      case 'stats':
        console.log('📊 Database Statistics:');
        console.log('='.repeat(40));
        const stats = await getDatabaseStats();
        stats.forEach(stat => {
          console.log(`${stat.role.padEnd(12)}: ${stat.count} users (${stat.admins} admins)`);
        });
        break;

      case 'delete':
        const deleteUsername = args[1];
        if (!deleteUsername) {
          console.error('❌ Username required: node db-utils.js delete <username>');
          process.exit(1);
        }
        const deletedCount = await deleteUser(deleteUsername);
        if (deletedCount > 0) {
          console.log(`✅ User '${deleteUsername}' deleted successfully`);
        } else {
          console.log(`❌ User '${deleteUsername}' not found`);
        }
        break;

      case 'reset-password':
        const resetUsername = args[1];
        const newPassword = args[2];
        if (!resetUsername || !newPassword) {
          console.error('❌ Usage: node db-utils.js reset-password <username> <new-password>');
          process.exit(1);
        }
        const passwordChanged = await resetPassword(resetUsername, newPassword);
        if (passwordChanged) {
          console.log(`✅ Password reset for '${resetUsername}'`);
        } else {
          console.log(`❌ User '${resetUsername}' not found`);
        }
        break;

      case 'make-admin':
        const adminUsername = args[1];
        if (!adminUsername) {
          console.error('❌ Username required: node db-utils.js make-admin <username>');
          process.exit(1);
        }
        const madeAdmin = await makeAdmin(adminUsername);
        if (madeAdmin) {
          console.log(`✅ User '${adminUsername}' is now an admin`);
        } else {
          console.log(`❌ User '${adminUsername}' not found`);
        }
        break;
      
        
      case 'seed-dev-users':
          const seedUsers = [
            { username: 'dev_admin', password: 'admin123', alias: 'DevAdmin', role: 'admin', is_admin: 1, kid_name: 'dev_admin_kid' },
            { username: 'dev_farmer', password: 'farmer123', alias: 'DevFarm', role: 'farmer', is_admin: 0, kid_name: 'dev_farmer_kid' },
            { username: 'dev_processor', password: 'processor123', alias: 'DevProcess', role: 'processor', is_admin: 0, kid_name: 'dev_processor_kid' },
            { username: 'dev_distributor', password: 'distributor123', alias: 'DevDistribute', role: 'distributor', is_admin: 0, kid_name: 'dev_distributor_kid' },
            { username: 'dev_retailer', password: 'retailer123', alias: 'DevRetail', role: 'retailer', is_admin: 0, kid_name: 'dev_retailer_kid' },
            { username: 'dev_certifier', password: 'certifier123', alias: 'DevCertify', role: 'certifier', is_admin: 0, kid_name: 'dev_certifier_kid' },
          ];
        
          const db = getDb();
          for (const user of seedUsers) {
            const hash = await bcrypt.hash(user.password, 10);
        
            await new Promise((res, rej) => {
              db.run(
                `INSERT INTO users (username, password, kid_name, chaincode_alias, role, is_admin)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [user.username, hash, user.kid_name, user.alias, user.role, user.is_admin],
                function (err) {
                  if (err && err.message.includes('UNIQUE constraint failed')) {
                    console.log(`⚠️  Skipped ${user.username} (already exists)`);
                    res();
                  } else if (err) {
                    rej(err);
                  } else {
                    console.log(`✅ Created ${user.username} (${user.role})`);
                    res();
                  }
                }
              );
            });
          }
          db.close();
          break;
        

      case 'remove-admin':
        const removeAdminUsername = args[1];
        if (!removeAdminUsername) {
          console.error('❌ Username required: node db-utils.js remove-admin <username>');
          process.exit(1);
        }
        const removedAdmin = await removeAdmin(removeAdminUsername);
        if (removedAdmin) {
          console.log(`✅ Admin privileges removed from '${removeAdminUsername}'`);
        } else {
          console.log(`❌ User '${removeAdminUsername}' not found`);
        }
        break;

      case 'backup':
        const backupPath = args[1];
        const savedBackup = await backupDatabase(backupPath);
        console.log(`✅ Database backed up to: ${savedBackup}`);
        break;

      case 'restore':
        const restorePath = args[1];
        if (!restorePath) {
          console.error('❌ Backup path required: node db-utils.js restore <backup-path>');
          process.exit(1);
        }
        await restoreDatabase(restorePath);
        console.log(`✅ Database restored from: ${restorePath}`);
        break;

      case 'help':
      default:
        console.log('🛠️  Foodtrace Database Utilities\n');
        console.log('Usage: node db-utils.js <command> [options]\n');
        console.log('Commands:');
        console.log('  list                           List all users');
        console.log('  stats                          Show database statistics');
        console.log('  delete <username>              Delete a user');
        console.log('  reset-password <user> <pass>   Reset user password');
        console.log('  make-admin <username>          Grant admin privileges');
        console.log('  remove-admin <username>        Remove admin privileges');
        console.log('  backup [path]                  Backup database');
        console.log('  restore <path>                 Restore database from backup');
        console.log('  help                           Show this help message');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run CLI if called directly
if (require.main === module) {
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found. Please run bootstrap first.');
    process.exit(1);
  }
  cli();
}

module.exports = {
  listUsers,
  deleteUser,
  resetPassword,
  makeAdmin,
  removeAdmin,
  backupDatabase,
  restoreDatabase,
  getDatabaseStats
};