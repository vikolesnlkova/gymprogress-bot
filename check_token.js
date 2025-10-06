require('dotenv').config();
const token = process.env.BOT_TOKEN;
console.log('Token exists:', !!token);
console.log('Token starts with:', token ? token.substring(0, 10) + '...' : 'none');
console.log('Token length:', token ? token.length : 0);
